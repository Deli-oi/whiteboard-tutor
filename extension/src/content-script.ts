/**
 * Phase 3 of the extension pivot: box-select (from Phase 2) now flows into
 * voice capture. Select a region, speak what you want, see the transcript
 * tied to that selection. Still no LLM call or file edit - that's Phase 4/5.
 *
 * Reuses client/voice/stt.ts as-is (confirmed zero tldraw coupling earlier
 * in the pivot) - this is the whole point of the reuse-first plan.
 */
import { createStt, isBrowserSttSupported, SttEngineInstance } from '../../client/voice/stt'

interface Match {
	el: Element
	coverage: number
	area: number
	start: number
	end: number
}

type Mode = 'idle' | 'selecting' | 'listening'

let mode: Mode = 'idle'
let overlayEl: HTMLDivElement | null = null
let badgeEl: HTMLDivElement | null = null
let boxEl: HTMLDivElement | null = null
let panelEl: HTMLDivElement | null = null
let stt: SttEngineInstance | null = null
let startX = 0
let startY = 0
let activeMatches: Match[] | null = null
let activeRect: DOMRect | null = null

function enterSelectMode() {
	closeEverything()
	mode = 'selecting'

	const overlay = document.createElement('div')
	Object.assign(overlay.style, {
		position: 'fixed',
		inset: '0',
		zIndex: '2147483647',
		cursor: 'crosshair',
		background: 'rgba(0,0,0,0.02)',
	})
	overlay.addEventListener('mousedown', onMouseDown)
	document.documentElement.appendChild(overlay)
	overlayEl = overlay

	setBadge('Circle-select active — drag a box, Esc to cancel')
	document.addEventListener('keydown', onKeyDown)
}

function setBadge(text: string) {
	badgeEl?.remove()
	const badge = document.createElement('div')
	badge.textContent = text
	Object.assign(badge.style, {
		position: 'fixed',
		top: '12px',
		left: '50%',
		transform: 'translateX(-50%)',
		background: '#1a1a1a',
		color: '#fff',
		padding: '6px 14px',
		borderRadius: '6px',
		fontFamily: 'system-ui, sans-serif',
		fontSize: '13px',
		zIndex: '2147483647',
		pointerEvents: 'none',
		boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
	})
	document.documentElement.appendChild(badge)
	badgeEl = badge
}

/** Removes the crosshair/badge/box but leaves the result panel (if any) visible. */
function exitSelectMode() {
	overlayEl?.remove()
	badgeEl?.remove()
	boxEl?.remove()
	document.removeEventListener('keydown', onKeyDown)
	overlayEl = badgeEl = boxEl = null
}

function closeEverything() {
	stt?.abort()
	stt = null
	exitSelectMode()
	panelEl?.remove()
	panelEl = null
	activeMatches = null
	activeRect = null
	mode = 'idle'
}

function onKeyDown(e: KeyboardEvent) {
	if (e.key !== 'Escape') return
	if (mode === 'listening') {
		// Escape cancels capture but keeps the selection result on screen -
		// rewrite the panel so it doesn't just say "Listening..." forever.
		stt?.abort()
		stt = null
		mode = 'idle'
		if (activeRect && activeMatches) {
			showPanel(activeRect, `${matchSummary(activeMatches)}\n\n(listening cancelled)`)
		}
		return
	}
	closeEverything()
}

function onMouseDown(e: MouseEvent) {
	startX = e.clientX
	startY = e.clientY
	boxEl = document.createElement('div')
	Object.assign(boxEl.style, {
		position: 'fixed',
		border: '2px solid #3b82f6',
		background: 'rgba(59,130,246,0.15)',
		zIndex: '2147483647',
		pointerEvents: 'none',
	})
	document.documentElement.appendChild(boxEl)
	document.addEventListener('mousemove', onMouseMove)
	document.addEventListener('mouseup', onMouseUp)
	e.preventDefault()
}

function onMouseMove(e: MouseEvent) {
	if (!boxEl) return
	const x = Math.min(startX, e.clientX)
	const y = Math.min(startY, e.clientY)
	const w = Math.abs(e.clientX - startX)
	const h = Math.abs(e.clientY - startY)
	Object.assign(boxEl.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' })
}

function onMouseUp() {
	document.removeEventListener('mousemove', onMouseMove)
	document.removeEventListener('mouseup', onMouseUp)
	const rect = boxEl?.getBoundingClientRect()
	exitSelectMode()
	if (!rect || rect.width < 4 || rect.height < 4) {
		mode = 'idle'
		return // a stray click, not a real drag
	}
	const matches = findMatches(rect)
	if (matches.length === 0) {
		showPanel(rect, 'No tagged elements in that box.\n(Only elements served by the Phase 1 source-tagging dev plugin are selectable.)')
		mode = 'idle'
		return
	}
	activeMatches = matches
	activeRect = rect
	startListening(rect, matches)
}

/** Every source-tagged element the selection box overlaps, best match first. */
function findMatches(selectionRect: DOMRect): Match[] {
	const candidates = document.querySelectorAll('[data-src-start][data-src-end]')
	const results: Match[] = []
	for (const el of candidates) {
		const r = el.getBoundingClientRect()
		const ix = Math.max(0, Math.min(r.right, selectionRect.right) - Math.max(r.left, selectionRect.left))
		const iy = Math.max(0, Math.min(r.bottom, selectionRect.bottom) - Math.max(r.top, selectionRect.top))
		const intersection = ix * iy
		if (intersection <= 0) continue
		const ownArea = Math.max(1, r.width * r.height)
		results.push({
			el,
			coverage: intersection / ownArea,
			area: ownArea,
			start: Number(el.getAttribute('data-src-start')),
			end: Number(el.getAttribute('data-src-end')),
		})
	}
	// Prefer the element most fully covered by the box; among ties, the
	// smallest (most specific) one.
	results.sort((a, b) => b.coverage - a.coverage || a.area - b.area)
	return results
}

function describe(el: Element): string {
	const tag = el.tagName.toLowerCase()
	const id = el.id ? '#' + el.id : ''
	const cls = el.classList.length ? '.' + Array.from(el.classList).join('.') : ''
	return tag + id + cls
}

function matchSummary(matches: Match[]): string {
	const best = matches[0]
	const preview = (best.el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
	return (
		`Selected: ${describe(best.el)}\n` +
		`source range: [${best.start}, ${best.end})\n` +
		`content: "${preview}${preview.length === 80 ? '…' : ''}"` +
		(matches.length > 1 ? `\n(${matches.length - 1} other candidate(s) also in the box)` : '')
	)
}

function startListening(rect: DOMRect, matches: Match[]) {
	mode = 'listening'
	const engine = isBrowserSttSupported() ? 'browser' : 'groq'
	let interim = ''

	showPanel(rect, `${matchSummary(matches)}\n\n🎤 Listening…`)

	stt = createStt(engine, {
		onInterim(text) {
			interim = text
			showPanel(rect, `${matchSummary(matches)}\n\n🎤 Listening… "${interim}"`)
		},
		onFinal(text) {
			void generateVisualization(rect, matches, text)
		},
		onError(message) {
			showPanel(rect, `${matchSummary(matches)}\n\n⚠️ ${message}`)
		},
		onEnd() {
			stt = null
			mode = 'idle'
		},
	})
	void stt.start()
}

interface GeneratedAction {
	_type: string
	html?: string
	w?: number
	h?: number
}

/**
 * Phase 4: send the circled element's context + transcript to the new lean
 * worker route and render whatever comes back. Scoped to createHtml for now
 * - see worker/routes/generateFragment.ts for why.
 */
async function generateVisualization(rect: DOMRect, matches: Match[], transcript: string) {
	const best = matches[0]
	showPanel(rect, `${matchSummary(matches)}\n\n✅ Heard: "${transcript}"\n\n⚙️ Generating…`)

	try {
		const res = await fetch(`${location.origin}/extension/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				transcript,
				selection: {
					tag: best.el.tagName.toLowerCase(),
					id: best.el.id || undefined,
					classes: best.el.classList.length ? Array.from(best.el.classList) : undefined,
					preview: (best.el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 300),
				},
			}),
		})
		if (!res.ok) {
			showPanel(rect, `${matchSummary(matches)}\n\n⚠️ Generation failed: ${await res.text()}`)
			return
		}
		const { action } = (await res.json()) as { action: GeneratedAction }
		if (action._type !== 'createHtml' || !action.html) {
			showPanel(rect, `${matchSummary(matches)}\n\n⚠️ Got an unexpected action type: ${action._type}`)
			return
		}
		showGeneratedVisualization(rect, action)
	} catch (e) {
		showPanel(rect, `${matchSummary(matches)}\n\n⚠️ ${e instanceof Error ? e.message : 'Generation failed'}`)
	}
}

/**
 * Renders the result in a sandboxed iframe near the selection - same
 * security model as the main app's HtmlShapeUtil.tsx (allow-scripts, no
 * allow-same-origin, so generated JS can't reach this page's DOM/storage/
 * cookies). This is still just a floating preview; Phase 5 is what actually
 * splices it into the real file.
 */
function showGeneratedVisualization(selectionRect: DOMRect, action: GeneratedAction) {
	panelEl?.remove()

	const w = action.w ?? 400
	const h = action.h ?? 300
	const container = document.createElement('div')
	Object.assign(container.style, {
		position: 'fixed',
		zIndex: '2147483647',
		width: w + 'px',
		height: h + 'px',
		background: 'white',
		borderRadius: '8px',
		boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
		overflow: 'hidden',
	})
	container.style.top = Math.max(8, Math.min(selectionRect.bottom + 8, window.innerHeight - h - 8)) + 'px'
	container.style.left = Math.min(Math.max(8, selectionRect.left), window.innerWidth - w - 8) + 'px'

	const closeBtn = document.createElement('button')
	closeBtn.textContent = '✕'
	Object.assign(closeBtn.style, {
		position: 'absolute',
		top: '4px',
		right: '4px',
		zIndex: '1',
		border: 'none',
		background: 'rgba(0,0,0,0.6)',
		color: 'white',
		borderRadius: '4px',
		width: '22px',
		height: '22px',
		cursor: 'pointer',
		fontSize: '12px',
	})
	closeBtn.addEventListener('click', () => container.remove())

	const iframe = document.createElement('iframe')
	iframe.setAttribute('sandbox', 'allow-scripts')
	iframe.srcdoc = action.html ?? ''
	Object.assign(iframe.style, { width: '100%', height: '100%', border: '0', display: 'block' })

	container.appendChild(iframe)
	container.appendChild(closeBtn)
	document.documentElement.appendChild(container)
	panelEl = container
}

/**
 * Content grows while listening (the live transcript line is appended at
 * the end), so this has to size itself to whatever room is actually
 * available - a fixed guess at the panel's height either clips the live
 * line off the bottom of the viewport (unreachable, since a `position:
 * fixed` element isn't affected by page scroll) or leaves it with no way
 * to scroll at all. Always keep the latest line in view.
 */
function showPanel(selectionRect: DOMRect, text: string) {
	panelEl?.remove()
	const panel = document.createElement('div')
	Object.assign(panel.style, {
		position: 'fixed',
		zIndex: '2147483647',
		maxWidth: '420px',
		background: '#1a1a1a',
		color: '#e5e5e5',
		padding: '12px 14px',
		borderRadius: '8px',
		fontFamily: 'ui-monospace, monospace',
		fontSize: '12px',
		lineHeight: '1.5',
		boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
		whiteSpace: 'pre-wrap',
		overflowY: 'auto',
	})

	const margin = 8
	const spaceBelow = window.innerHeight - selectionRect.bottom - margin
	const spaceAbove = selectionRect.top - margin
	// Prefer below the selection; switch above only if there's meaningfully
	// more room there (e.g. the selection is near the bottom of the page).
	const placeAbove = spaceBelow < 120 && spaceAbove > spaceBelow

	panel.style.maxHeight = Math.max(100, (placeAbove ? spaceAbove : spaceBelow) - margin) + 'px'
	if (placeAbove) {
		panel.style.bottom = window.innerHeight - selectionRect.top + margin + 'px'
	} else {
		panel.style.top = selectionRect.bottom + margin + 'px'
	}
	panel.style.left = Math.min(Math.max(8, selectionRect.left), window.innerWidth - 440) + 'px'

	panel.textContent = text
	document.documentElement.appendChild(panel)
	panelEl = panel
	panel.scrollTop = panel.scrollHeight
}

chrome.runtime.onMessage.addListener((message) => {
	if (message?.type !== 'toggle-overlay') return
	if (mode !== 'idle') closeEverything()
	else enterSelectMode()
})
