/**
 * Runs on any webpage: circle something, speak, get a real computed
 * visualization in a floating, dismissable popup. Tier 1 ("Anywhere") only
 * - the companion app and direct file-editing (Tier 2) were built, tested,
 * and then retired (too much setup friction for the benefit delivered); see
 * project memory for the full history if that ever gets revisited.
 */
import { createStt, SttEngineInstance } from '../../shared/voice/stt'
import type { Selection } from './generate'

interface Match {
	el: Element
	coverage: number
	area: number
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

/**
 * Tears down the hold-V-to-iterate listeners a generated-visualization popup
 * installs (see showGeneratedVisualization) - set only while that kind of
 * popup is open, called everywhere panelDragCleanup is, so it never outlives
 * the popup it belongs to.
 */
let panelVoiceCleanup: (() => void) | null = null

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
	panelVoiceCleanup?.()
	panelVoiceCleanup = null
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
 * Every element the selection box overlaps, best match first. Rect-
 * intersection against every element on the page doesn't scale to a real
 * site's DOM size, so this samples a grid of points inside the box with
 * `elementsFromPoint` instead - a constant number of point-queries
 * regardless of how big the page's DOM is, same standard technique
 * devtools-style element pickers use. By the time this runs,
 * exitSelectMode() has already removed the overlay/badge/box, so the
 * samples land on real page content, never our own UI.
 */
function findMatches(selectionRect: DOMRect): Match[] {
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
	return (
		`Selected: ${describe(best.el)}\n` +
		`content: "${preview}${preview.length === 80 ? '…' : ''}"` +
		(matches.length > 1 ? `\n(${matches.length - 1} other candidate(s) also in the box)` : '')
	)
}

function startListening(rect: DOMRect, matches: Match[]) {
	mode = 'listening'
	let interim = ''

	showPanel(rect, `${matchSummary(matches)}\n\n🎤 Listening…`)

	stt = createStt({
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
	html: string
}

interface GenerateRelayResponse {
	ok: boolean
	action?: GeneratedAction
	error?: string
}

/**
 * Phase 5: relayed through background.js rather than called directly - the
 * API key lives in chrome.storage.local, and a visited page's own JS context
 * (where this content script runs) has no business touching it. The
 * background script does the actual model call now, with no worker/
 * localhost dependency at all.
 */
async function generateVisualization(rect: DOMRect, matches: Match[], transcript: string) {
	const best = matches[0]
	const selection: Selection = {
		tag: best.el.tagName.toLowerCase(),
		id: best.el.id || undefined,
		classes: best.el.classList.length ? Array.from(best.el.classList) : undefined,
		preview: (best.el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 300),
	}
	showPanel(rect, `${matchSummary(matches)}\n\n✅ Heard: "${transcript}"\n\n⚙️ Generating…`)

	try {
		const relay = (await chrome.runtime.sendMessage({
			type: 'generate',
			payload: { transcript, selection },
		})) as GenerateRelayResponse
		if (!relay.ok || !relay.action) {
			showPanel(rect, `${matchSummary(matches)}\n\n⚠️ Generation failed: ${relay.error ?? 'unknown error'}`)
			return
		}
		if (relay.action._type !== 'createHtml') {
			showPanel(rect, `${matchSummary(matches)}\n\n⚠️ Got an unexpected action type: ${relay.action._type}`)
			return
		}
		showGeneratedVisualization(rect, relay.action, selection)
	} catch (e) {
		showPanel(rect, `${matchSummary(matches)}\n\n⚠️ ${e instanceof Error ? e.message : 'Generation failed'}`)
	}
}

/**
 * Renders the result in render.html - a page bundled inside the extension
 * and declared under manifest.json's `sandbox.pages` (see render.ts for why:
 * it's the documented Chrome pattern for running untrusted/dynamic HTML with
 * inline scripts allowed). Loaded via `chrome.runtime.getURL(...)` as a real
 * `chrome-extension://` document, not `action.html` via `srcdoc`: confirmed
 * live that a srcdoc/data: iframe inherits the EMBEDDING page's CSP, which
 * silently blocks all script execution (inline or external) on a strict-CSP
 * site like GitHub - the HTML still rendered, nothing ever ran. A real,
 * separate-origin document gets its own CSP instead, independent of
 * whatever page it's circled on, and chrome-extension:// loads aren't
 * subject to mixed-content blocking either (confirmed broken case: Gmail,
 * an HTTPS page, silently dropping an http:// iframe source).
 *
 * The HTML payload itself can't go through chrome.storage - a sandboxed
 * page has no access to chrome.* APIs at all (that's the point: it's the
 * boundary around code the extension doesn't trust). It's handed over via
 * postMessage once the iframe has loaded instead.
 */
const DRAG_HANDLE_HEIGHT = 22
const PANEL_W = 440
const PANEL_H = 340
const MIC_SIZE = 20

function showGeneratedVisualization(selectionRect: DOMRect, action: GeneratedAction, selection: Selection) {
	panelDragCleanup?.()
	panelVoiceCleanup?.()
	panelEl?.remove()

	const w = PANEL_W
	const h = PANEL_H + DRAG_HANDLE_HEIGHT
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
		panelVoiceCleanup?.()
		panelVoiceCleanup = null
		container.remove()
	})
	header.appendChild(closeBtn)

	const iframe = document.createElement('iframe')
	Object.assign(iframe.style, { width: '100%', flex: '1 1 auto', border: '0', display: 'block' })
	let currentHtml = action.html
	iframe.addEventListener('load', () => {
		iframe.contentWindow?.postMessage({ html: currentHtml }, '*')
	})
	/**
	 * Every render - initial and every hold-V iteration - navigates the iframe
	 * to a fresh copy of render.html rather than reusing the same live
	 * document via another postMessage. Whether render.ts's listener survives
	 * the FIRST document.open()/write() it does to inject model HTML is
	 * spec-ambiguous (document.open() is documented to clear a document's own
	 * event listeners in some cases) - confirmed broken in practice: a second
	 * postMessage sent to an already-rendered iframe silently went nowhere,
	 * `currentHtml` updated but nothing redrew. A fresh navigation sidesteps
	 * the question entirely by re-running render.ts's script from scratch
	 * every time, exactly like the first render that's already proven to work.
	 */
	function loadVisualization() {
		iframe.src = chrome.runtime.getURL('render.html') + '?t=' + Date.now()
	}
	loadVisualization()

	// Bottom-left mic badge: grey while idle, red while hold-V capture is
	// active. Lets you say "make the bars blue" or "actually, plot it as a
	// line" without re-circling the element - the whole point being fast
	// iteration/clarification on a result you're already looking at.
	const micBadge = document.createElement('div')
	micBadge.textContent = '🎤'
	Object.assign(micBadge.style, {
		position: 'absolute',
		left: '6px',
		bottom: '6px',
		width: MIC_SIZE + 'px',
		height: MIC_SIZE + 'px',
		borderRadius: '50%',
		background: '#8a8a8a',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontSize: '10px',
		lineHeight: '1',
		boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
		pointerEvents: 'none',
		zIndex: '1',
		transition: 'background-color 0.1s',
	})

	// Shown over the iframe while an iteration request is in flight - the
	// round trip is a real model call (not instant), and with no status panel
	// on this path (unlike the initial generation), there was otherwise no
	// sign anything was happening between releasing V and the result landing.
	const generatingLabel = document.createElement('div')
	generatingLabel.textContent = 'Generating…'
	Object.assign(generatingLabel.style, {
		position: 'absolute',
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%)',
		padding: '6px 14px',
		borderRadius: '6px',
		background: 'rgba(0,0,0,0.55)',
		color: 'white',
		fontFamily: 'system-ui, sans-serif',
		fontSize: '12px',
		pointerEvents: 'none',
		zIndex: '1',
		display: 'none',
	})

	let iterateStt: SttEngineInstance | null = null

	async function iterateVisualization(transcript: string) {
		generatingLabel.style.display = 'block'
		try {
			const relay = (await chrome.runtime.sendMessage({
				type: 'generate',
				payload: { transcript, selection, previousHtml: currentHtml },
			})) as GenerateRelayResponse
			if (!relay.ok || !relay.action || relay.action._type !== 'createHtml') {
				console.error('[iterate] generation failed:', relay.error ?? relay.action?._type)
				return
			}
			currentHtml = relay.action.html
			loadVisualization()
		} catch (e) {
			// A failed iteration just leaves the existing visualization showing -
			// there's no status panel for this path, so this is logged rather
			// than surfaced, but logged so a failure is at least diagnosable.
			console.error('[iterate] request failed:', e)
		} finally {
			generatingLabel.style.display = 'none'
		}
	}

	function startIterateCapture() {
		if (iterateStt) return
		micBadge.style.background = '#ef4444'
		let interimText = ''
		let gotFinal = false
		iterateStt = createStt({
			onInterim(text) {
				interimText = text
			},
			onFinal(text) {
				gotFinal = true
				void iterateVisualization(text)
			},
			onError(message) {
				console.error('[iterate]', message)
				micBadge.style.background = '#d97706'
				setTimeout(() => {
					micBadge.style.background = '#8a8a8a'
				}, 600)
			},
			onEnd() {
				iterateStt = null
				micBadge.style.background = '#8a8a8a'
				// Releasing V calls stop() immediately, which can race the Web
				// Speech API's own finalization - if nothing was ever marked
				// final, fall back to whatever interim text it had so far rather
				// than silently dropping the request (confirmed cause of "nothing
				// happens" when V is released right after speaking).
				if (!gotFinal && interimText.trim()) void iterateVisualization(interimText.trim())
			},
		})
		void iterateStt.start()
	}
	function stopIterateCapture() {
		iterateStt?.stop()
	}

	/**
	 * Hold-V on the TOP page only fires while this document itself has focus.
	 * Clicking anything inside the generated visualization (a chart, a
	 * button) moves focus into the iframe's own document - keydown events
	 * are scoped to whichever document currently has focus and never bubble
	 * across that boundary, so this listener alone silently stops working
	 * the moment the user interacts with the visualization at all (confirmed
	 * bug report: "only works if you don't click anything in between").
	 * render.ts captures V inside the iframe itself and forwards it here via
	 * postMessage, so both paths funnel into the same start/stop functions.
	 */
	function onIterateKeyDown(e: KeyboardEvent) {
		if (e.key.toLowerCase() !== 'v' || iterateStt) return
		// Checked live via :hover (not a mouseenter/mouseleave-tracked flag):
		// the popup usually appears right under the cursor, so mouseenter would
		// never fire unless the mouse moved afterward - :hover reflects the
		// cursor's actual current position regardless of how it got there.
		if (!container.matches(':hover')) return
		// Guard against hijacking a "v" typed into some unrelated input/textarea
		// the cursor happens to be resting over (e.g. a text field elsewhere on
		// the page, behind/below this popup).
		const active = document.activeElement
		const isTyping =
			active instanceof HTMLInputElement ||
			active instanceof HTMLTextAreaElement ||
			(active instanceof HTMLElement && active.isContentEditable)
		if (isTyping) return
		e.preventDefault()
		startIterateCapture()
	}
	function onIterateKeyUp(e: KeyboardEvent) {
		if (e.key.toLowerCase() !== 'v') return
		stopIterateCapture()
	}
	function onIframeKeyMessage(e: MessageEvent) {
		if (e.source !== iframe.contentWindow) return
		if (e.data?.type === 'iterate-key-down') startIterateCapture()
		else if (e.data?.type === 'iterate-key-up') stopIterateCapture()
	}
	document.addEventListener('keydown', onIterateKeyDown)
	document.addEventListener('keyup', onIterateKeyUp)
	window.addEventListener('message', onIframeKeyMessage)
	panelVoiceCleanup = () => {
		document.removeEventListener('keydown', onIterateKeyDown)
		document.removeEventListener('keyup', onIterateKeyUp)
		window.removeEventListener('message', onIframeKeyMessage)
		iterateStt?.abort()
		iterateStt = null
	}

	container.appendChild(header)
	container.appendChild(iframe)
	container.appendChild(micBadge)
	container.appendChild(generatingLabel)
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
