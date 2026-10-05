/**
 * Phase 4.5 of the extension pivot: runs on any webpage now, not just the
 * local dev server. Two modes, auto-detected per selection, no manual
 * toggle - see the plan (ancient-rolling-hellman.md) for the full reasoning:
 *
 * - Tagged selection (the Phase 1 plugin's data-src-start/end attributes
 *   are present - i.e. this is a page served by a dev server we control):
 *   persistent-edit mode. Phase 5 is what actually writes to disk; for now
 *   this still just previews, same as the untagged case.
 * - Untagged selection (any other webpage): ephemeral-preview mode. Same
 *   generation call, but there's nowhere to write to, so it only ever
 *   floats a dismissable preview.
 *
 * Reuses client/voice/stt.ts as-is (confirmed zero tldraw coupling earlier
 * in the pivot) - this is the whole point of the reuse-first plan.
 */
import { createStt, isBrowserSttSupported, SttEngineInstance } from '../../client/voice/stt'

interface Match {
	el: Element
	coverage: number
	area: number
	/** Present only for a tagged (dev-server) match - absent means ephemeral-preview mode. */
	start?: number
	end?: number
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

// Both the status panel and the generated-visualization box get removed and
// recreated on every update (new interim text, generating -> done, etc.),
// so drag state has to live outside those elements or it resets every time
// the user is mid-drag. draggedPosition persists across one interaction
// (cleared on closeEverything); panelDragCleanup detaches the previous
// element's document-level mouse listeners so they don't pile up with each
// recreation.
let draggedPosition: { top: number; left: number } | null = null
let panelDragCleanup: (() => void) | null = null

/** Makes `el` draggable by mousedown-drag on `handle` (defaults to `el` itself). */
function makeDraggable(el: HTMLElement, handle: HTMLElement = el): () => void {
	let dragging = false
	let offsetX = 0
	let offsetY = 0

	const onMouseDown = (e: MouseEvent) => {
		dragging = true
		const rect = el.getBoundingClientRect()
		offsetX = e.clientX - rect.left
		offsetY = e.clientY - rect.top
		e.preventDefault()
	}
	const onMouseMove = (e: MouseEvent) => {
		if (!dragging) return
		const left = Math.min(Math.max(0, e.clientX - offsetX), window.innerWidth - el.offsetWidth)
		const top = Math.min(Math.max(0, e.clientY - offsetY), window.innerHeight - el.offsetHeight)
		el.style.left = left + 'px'
		el.style.top = top + 'px'
		el.style.right = ''
		el.style.bottom = ''
		draggedPosition = { top, left }
	}
	const onMouseUp = () => {
		dragging = false
	}

	handle.style.cursor = 'move'
	handle.addEventListener('mousedown', onMouseDown)
	document.addEventListener('mousemove', onMouseMove)
	document.addEventListener('mouseup', onMouseUp)

	return () => {
		document.removeEventListener('mousemove', onMouseMove)
		document.removeEventListener('mouseup', onMouseUp)
	}
}

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
	panelDragCleanup?.()
	panelDragCleanup = null
	draggedPosition = null
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
		showPanel(rect, 'Nothing selectable in that box - try circling some text or a visible element.')
		mode = 'idle'
		return
	}
	activeMatches = matches
	activeRect = rect
	startListening(rect, matches)
}

/**
 * Every element the selection box overlaps, best match first. Tries the
 * precise tagged path first (exact rect-intersection against the Phase 1
 * plugin's attributes); only falls back to the untagged heuristic when the
 * page has no tagging at all, so a dev-server page always gets the precise
 * path even if the circled element itself is a child of a tagged ancestor.
 */
function findMatches(selectionRect: DOMRect): Match[] {
	const tagged = findTaggedMatches(selectionRect)
	if (tagged.length > 0) return tagged
	return findUntaggedMatches(selectionRect)
}

function findTaggedMatches(selectionRect: DOMRect): Match[] {
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

/**
 * Ephemeral-preview fallback for pages with no source-tagging at all (i.e.
 * almost every real website). Rect-intersection against every element on
 * the page doesn't scale to a real site's DOM size, so this samples a grid
 * of points inside the box with `elementsFromPoint` instead - a constant
 * number of point-queries regardless of how big the page's DOM is, same
 * standard technique devtools-style element pickers use. By the time this
 * runs, exitSelectMode() has already removed the overlay/badge/box, so the
 * samples land on real page content, never our own UI.
 */
function findUntaggedMatches(selectionRect: DOMRect): Match[] {
	const SAMPLES_PER_AXIS = 5
	const counts = new Map<Element, number>()
	for (let i = 0; i < SAMPLES_PER_AXIS; i++) {
		for (let j = 0; j < SAMPLES_PER_AXIS; j++) {
			const x = selectionRect.left + (selectionRect.width * (i + 0.5)) / SAMPLES_PER_AXIS
			const y = selectionRect.top + (selectionRect.height * (j + 0.5)) / SAMPLES_PER_AXIS
			const el = document.elementsFromPoint(x, y)[0]
			if (el) counts.set(el, (counts.get(el) ?? 0) + 1)
		}
	}
	const total = SAMPLES_PER_AXIS * SAMPLES_PER_AXIS
	const results: Match[] = []
	for (const [el, count] of counts) {
		const r = el.getBoundingClientRect()
		results.push({ el, coverage: count / total, area: Math.max(1, r.width * r.height) })
	}
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
	const tagged = best.start !== undefined && best.end !== undefined
	return (
		`Selected: ${describe(best.el)}\n` +
		(tagged
			? `source range: [${best.start}, ${best.end}) - editable\n`
			: `(preview only - not a source-tagged page)\n`) +
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
	w?: number
	h?: number
}

interface GenerateRelayResponse {
	ok: boolean
	status: number
	body: string
}

/**
 * Phase 4.5: relayed through background.js instead of fetched directly -
 * the circled page is now usually NOT the dev server, so a direct
 * content-script fetch to it would be cross-origin and at the mercy of
 * whatever CSP the visited page sets. The background service worker's
 * fetch is governed by host_permissions instead and always reaches the
 * local worker regardless of what page you're circling something on.
 */
async function generateVisualization(rect: DOMRect, matches: Match[], transcript: string) {
	const best = matches[0]
	showPanel(rect, `${matchSummary(matches)}\n\n✅ Heard: "${transcript}"\n\n⚙️ Generating…`)

	try {
		const relay = (await chrome.runtime.sendMessage({
			type: 'generate',
			payload: {
				transcript,
				selection: {
					tag: best.el.tagName.toLowerCase(),
					id: best.el.id || undefined,
					classes: best.el.classList.length ? Array.from(best.el.classList) : undefined,
					preview: (best.el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 300),
				},
			},
		})) as GenerateRelayResponse
		if (!relay.ok) {
			showPanel(rect, `${matchSummary(matches)}\n\n⚠️ Generation failed: ${relay.body}`)
			return
		}
		const { action, renderUrl } = JSON.parse(relay.body) as { action: GeneratedAction; renderUrl?: string }
		if (action._type !== 'createHtml' || !renderUrl) {
			showPanel(rect, `${matchSummary(matches)}\n\n⚠️ Got an unexpected action type: ${action._type}`)
			return
		}
		showGeneratedVisualization(rect, action, renderUrl)
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
 *
 * Loads `renderUrl` (a real worker-hosted URL - worker/routes/
 * renderFragment.ts) via `src`, not `action.html` via `srcdoc`: confirmed
 * live that a srcdoc/data: iframe inherits the EMBEDDING page's CSP, which
 * silently blocks all script execution (inline or external) on a strict-CSP
 * site like GitHub - the HTML still rendered, nothing ever ran. A real,
 * separate-origin document gets its own CSP instead, independent of
 * whatever page it's circled on.
 */
const DRAG_HANDLE_HEIGHT = 22

function showGeneratedVisualization(selectionRect: DOMRect, action: GeneratedAction, renderUrl: string) {
	panelDragCleanup?.()
	panelEl?.remove()

	const w = action.w ?? 400
	const h = (action.h ?? 300) + DRAG_HANDLE_HEIGHT
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
		display: 'flex',
		flexDirection: 'column',
	})
	if (draggedPosition) {
		container.style.top = draggedPosition.top + 'px'
		container.style.left = draggedPosition.left + 'px'
	} else {
		container.style.top = Math.max(8, Math.min(selectionRect.bottom + 8, window.innerHeight - h - 8)) + 'px'
		container.style.left = Math.min(Math.max(8, selectionRect.left), window.innerWidth - w - 8) + 'px'
	}

	// Drag handle - the iframe is its own browsing context, so a mousedown
	// inside it never reaches a drag listener on the container. This small
	// header bar is the only part of a generated-visualization popup that
	// can actually be grabbed.
	const header = document.createElement('div')
	Object.assign(header.style, {
		height: DRAG_HANDLE_HEIGHT + 'px',
		flex: '0 0 auto',
		background: '#1a1a1a',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'flex-end',
		padding: '0 4px',
		boxSizing: 'border-box',
	})

	const closeBtn = document.createElement('button')
	closeBtn.textContent = '✕'
	Object.assign(closeBtn.style, {
		border: 'none',
		background: 'transparent',
		color: 'white',
		borderRadius: '4px',
		width: '18px',
		height: '18px',
		cursor: 'pointer',
		fontSize: '11px',
		lineHeight: '1',
	})
	closeBtn.addEventListener('click', () => {
		panelDragCleanup?.()
		panelDragCleanup = null
		container.remove()
	})
	header.appendChild(closeBtn)

	const iframe = document.createElement('iframe')
	iframe.setAttribute('sandbox', 'allow-scripts')
	iframe.src = renderUrl
	Object.assign(iframe.style, { width: '100%', flex: '1 1 auto', border: '0', display: 'block' })

	container.appendChild(header)
	container.appendChild(iframe)
	document.documentElement.appendChild(container)
	panelEl = container
	panelDragCleanup = makeDraggable(container, header)
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
	panelDragCleanup?.()
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

	if (draggedPosition) {
		panel.style.top = draggedPosition.top + 'px'
		panel.style.left = draggedPosition.left + 'px'
		panel.style.maxHeight = Math.max(100, window.innerHeight - draggedPosition.top - 8) + 'px'
	} else {
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
	}

	panel.textContent = text
	document.documentElement.appendChild(panel)
	panelEl = panel
	panel.scrollTop = panel.scrollHeight
	panelDragCleanup = makeDraggable(panel)
}

chrome.runtime.onMessage.addListener((message) => {
	if (message?.type !== 'toggle-overlay') return
	if (mode !== 'idle') closeEverything()
	else enterSelectMode()
})
