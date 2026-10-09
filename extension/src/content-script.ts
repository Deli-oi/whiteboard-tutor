/**
 * Injected on demand (see background.ts) into the tab where the shortcut is
 * pressed: circle something, speak, get a real computed visualization in a
 * floating, dismissable popup.
 */
import { createStt, SttEngineInstance } from '../../shared/voice/stt'
import type { Selection } from './generate'

interface Match {
	el: Element
	coverage: number
	area: number
	/** Text visibly inside the selection box (see visibleTextIn), set on the chosen match. */
	text?: string
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
/**
 * Resolves to a cropped screenshot of the circled region, or null when the
 * circled element has real DOM text (no vision needed). Kicked off in
 * onMouseUp - right when the box is finalized, before voice capture even
 * starts - rather than later once speech finishes, so the captured pixels
 * always match what was actually circled even if the page scrolls while the
 * user is still talking.
 */
let activeImagePromise: Promise<string | null> | null = null

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

/**
 * Bumped for every new generation and by closeEverything. A response only
 * acts if its id is still current - otherwise the user pressed Esc, closed
 * the popup, or started a new circle while it was in flight, and showing it
 * would pop a stale popup back up.
 */
let requestId = 0

/** Makes `el` draggable by mousedown-drag on `handle` (defaults to `el` itself). */
function makeDraggable(el: HTMLElement, handle: HTMLElement = el): () => void {
	let dragging = false
	let offsetX = 0
	let offsetY = 0

	const onMouseDown = (e: MouseEvent) => {
		// Let clicks reach form controls inside the panel (the typed-request box).
		if ((e.target as HTMLElement | null)?.closest('input, textarea')) return
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
	badge.textContent = '◎ ' + text
	Object.assign(badge.style, {
		position: 'fixed',
		top: '12px',
		left: '50%',
		transform: 'translateX(-50%)',
		background: '#1a1a1a',
		color: '#fff',
		padding: '7px 16px',
		borderRadius: '20px',
		fontFamily: 'system-ui, sans-serif',
		fontSize: '13px',
		zIndex: '2147483647',
		pointerEvents: 'none',
		boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
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
	requestId++
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
	activeImagePromise = null
	typedInput = null
	stopListeningKeys()
	mode = 'idle'
}

/** Esc while drawing the box; while listening, startListening's handler owns Esc. */
function onKeyDown(e: KeyboardEvent) {
	if (e.key === 'Escape') closeEverything()
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
	matches[0].text = visibleTextIn(matches[0].el, rect)
	activeImagePromise = needsVision(matches[0]) ? captureSelectionImage(rect) : Promise.resolve(null)
	startListening(rect, matches)
}

/**
 * Whether the circled element needs a screenshot instead of (or alongside)
 * its DOM text - an `<img>`/`<canvas>`/`<svg>` always does regardless of any
 * stray textContent, and anything else with no real text at all does too.
 * Covers two confirmed-broken cases uniformly: an actual image, and
 * canvas-rendered text (Google Docs draws its whole document onto a
 * `<canvas>` for rendering fidelity, so there's no real DOM text to read
 * there either) - without needing to special-case either one.
 */
function needsVision(m: Match): boolean {
	const tag = m.el.tagName.toUpperCase()
	if (tag === 'IMG' || tag === 'CANVAS' || tag === 'SVG') return true
	return selectionText(m).length === 0
}

/**
 * Screenshots the visible tab (via the background script - a content script
 * has no such API) and crops to exactly the circled region client-side. The
 * crop rect is scaled by devicePixelRatio: captureVisibleTab returns actual
 * device pixels, but getBoundingClientRect() is in CSS pixels - without this
 * the crop drifts on any non-1x display.
 */
async function captureSelectionImage(rect: DOMRect): Promise<string | null> {
	try {
		const relay = (await chrome.runtime.sendMessage({ type: 'capture-tab' })) as {
			ok: boolean
			dataUrl?: string
		}
		if (!relay.ok || !relay.dataUrl) return null

		const img = new Image()
		const loaded = new Promise<void>((resolve, reject) => {
			img.onload = () => resolve()
			img.onerror = () => reject(new Error('Screenshot failed to load'))
		})
		img.src = relay.dataUrl
		await loaded

		const dpr = window.devicePixelRatio || 1
		const w = Math.max(1, Math.round(rect.width * dpr))
		const h = Math.max(1, Math.round(rect.height * dpr))
		const canvas = document.createElement('canvas')
		canvas.width = w
		canvas.height = h
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		ctx.drawImage(img, Math.round(rect.left * dpr), Math.round(rect.top * dpr), w, h, 0, 0, w, h)
		return canvas.toDataURL('image/png').split(',')[1] ?? null
	} catch {
		return null
	}
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
	return promoteCommonAncestor(results, selectionRect)
}

/**
 * The deepest element under a sample point is often just one token: a
 * syntax-highlighted `<span>` inside a code block, or a single KaTeX glyph.
 * Prefer the lowest common ancestor of every sampled hit, so the model gets
 * the whole code block / equation / paragraph. But if that ancestor is much
 * bigger than the box (e.g. the samples straddle two sections and the LCA is
 * `<body>`), keep the best-coverage element instead. The chosen element is
 * moved to the front, so matches[0] is always "what was selected".
 */
const MAX_ANCESTOR_AREA_RATIO = 4

function promoteCommonAncestor(results: Match[], selectionRect: DOMRect): Match[] {
	if (results.length < 2) return results
	let common: Element | null = results[0].el
	for (const m of results) {
		while (common && !common.contains(m.el)) common = common.parentElement
		if (!common) return results
	}
	if (common === results[0].el) return results
	const r = common.getBoundingClientRect()
	const area = Math.max(1, r.width * r.height)
	const selectionArea = Math.max(1, selectionRect.width * selectionRect.height)
	if (area > selectionArea * MAX_ANCESTOR_AREA_RATIO) return results
	const existing = results.find((m) => m.el === common)
	const chosen: Match = existing ?? { el: common, coverage: 1, area }
	return [chosen, ...results.filter((m) => m !== chosen)]
}

/** Cap on the text sent to the model; the on-screen panel uses a short one-line preview instead. */
const MODEL_TEXT_LIMIT = 4000

/** innerText keeps line breaks and indentation (code, proofs); falls back to textContent for SVG etc. */
function elementText(el: Element): string {
	const raw = el instanceof HTMLElement ? el.innerText : el.textContent
	return (raw ?? el.textContent ?? '').trim()
}

/** The text the model gets: what's visibly inside the box, falling back to the whole element. */
function selectionText(m: Match): string {
	return m.text ?? elementText(m.el)
}

function intersects(a: DOMRect, b: DOMRect): boolean {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/**
 * Only the text actually rendered inside the selection box. The chosen
 * element is often a scroll container or panel (confirmed on LeetCode: the
 * whole problem pane, so innerText dragged in "Similar Questions" and the
 * entire discussion thread, scrolled out of view). Walks text nodes and keeps
 * those whose rendered boxes overlap the selection, adding a line break
 * whenever the enclosing block changes so paragraphs and code lines stay
 * separate. Whitespace is kept as-is inside `white-space: pre*` (code).
 */
function visibleTextIn(root: Element, selectionRect: DOMRect): string {
	const blockCache = new Map<Element, Element>()
	const nearestBlock = (node: Node): Element | null => {
		let el = node.parentElement
		const start = el
		while (el) {
			const cached = blockCache.get(el)
			if (cached) return cached
			const display = getComputedStyle(el).display
			if (!display.startsWith('inline') && display !== 'contents') break
			el = el.parentElement
		}
		if (start && el) blockCache.set(start, el)
		return el
	}

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
		acceptNode(node) {
			if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT
			const el = node as Element
			if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) return NodeFilter.FILTER_REJECT
			if (el.tagName === 'BR') return NodeFilter.FILTER_ACCEPT
			const r = el.getBoundingClientRect()
			// Zero-size wrappers (display: contents, collapsed inline) can still
			// hold visible children, so only prune subtrees with a real box.
			if (r.width > 0 && r.height > 0 && !intersects(r, selectionRect)) return NodeFilter.FILTER_REJECT
			return NodeFilter.FILTER_SKIP
		},
	})

	const range = document.createRange()
	let out = ''
	let lastBlock: Element | null = null
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			if (out && !out.endsWith('\n')) out += '\n'
			continue
		}
		const data = (node as Text).data
		if (!data.trim() && !out) continue
		range.selectNodeContents(node)
		if (!Array.from(range.getClientRects()).some((r) => intersects(r, selectionRect))) continue
		const parent = node.parentElement
		const ws = parent ? getComputedStyle(parent).whiteSpace : 'normal'
		const text = ws.startsWith('pre') || ws === 'break-spaces' ? data : data.replace(/\s+/g, ' ')
		const block = nearestBlock(node)
		if (lastBlock && block !== lastBlock && out && !out.endsWith('\n')) out += '\n'
		lastBlock = block
		out += text
		if (out.length > MODEL_TEXT_LIMIT) break
	}
	return out
		.split('\n')
		.map((line) => line.trimEnd())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
		.slice(0, MODEL_TEXT_LIMIT)
}

/**
 * The typed alternative to speaking. Voice stays the default; the listening
 * panel shows a small "Type instead" button that stops voice capture and
 * swaps in a text box (Enter sends). For people without a mic, in a quiet
 * library, or whose mic permission is blocked. Kept in a module variable
 * because showPanel rebuilds the panel on every interim transcript and
 * re-attaches this same element each time.
 */
let typedInput: HTMLElement | null = null

function createTypedInput(rect: DOMRect, matches: Match[]): HTMLElement {
	const wrapper = document.createElement('div')
	wrapper.style.marginTop = '8px'

	const button = document.createElement('button')
	button.type = 'button'
	button.textContent = '⌨️ Type instead'
	Object.assign(button.style, {
		padding: '3px 10px',
		border: '1px solid rgba(255,255,255,0.3)',
		borderRadius: '6px',
		background: 'transparent',
		color: '#e5e5e5',
		font: 'inherit',
		fontSize: '12px',
		cursor: 'pointer',
	})

	const input = document.createElement('input')
	input.type = 'text'
	input.placeholder = 'Type your request and press Enter'
	Object.assign(input.style, {
		display: 'block',
		width: '100%',
		boxSizing: 'border-box',
		padding: '6px 8px',
		border: '1px solid #3f3f46',
		borderRadius: '6px',
		background: '#27272a',
		color: '#e5e5e5',
		font: 'inherit',
		outline: 'none',
	})
	// Keep the page's own keyboard shortcuts from firing while typing here.
	for (const type of ['keydown', 'keyup', 'keypress']) {
		input.addEventListener(type, (e) => e.stopPropagation())
	}
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			closeEverything()
		} else if (e.key === 'Enter' && input.value.trim()) {
			void generateVisualization(rect, matches, input.value.trim())
		}
	})

	button.addEventListener('click', () => {
		stt?.abort()
		button.replaceWith(input)
		showPanel(rect, `⌨️ Type your request - Enter to send, Esc to cancel`)
		input.focus()
	})

	wrapper.appendChild(button)
	return wrapper
}

/**
 * Keys while the listening panel is up: Enter skips speaking and just
 * visualizes what was circled (the quick "circle -> visual" path), Esc
 * cancels. Capture phase so the page's own shortcuts don't swallow them;
 * ignored while typing in a text field (the Type-instead box handles its own
 * Enter). Removed once generation starts or everything closes.
 */
let listeningKeys: ((e: KeyboardEvent) => void) | null = null

function stopListeningKeys() {
	if (listeningKeys) document.removeEventListener('keydown', listeningKeys, true)
	listeningKeys = null
}

const LISTENING_LINE = '🎤 Listening… (or press Enter to just visualize it)'

function startListening(rect: DOMRect, matches: Match[]) {
	mode = 'listening'
	let interim = ''

	typedInput = createTypedInput(rect, matches)
	showPanel(rect, LISTENING_LINE)

	stopListeningKeys()
	listeningKeys = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement | null
		if (target?.closest('input, textarea, select') || target?.isContentEditable) return
		if (e.key === 'Enter') {
			e.preventDefault()
			e.stopPropagation()
			stt?.abort()
			void generateVisualization(rect, matches, '')
		} else if (e.key === 'Escape') {
			e.preventDefault()
			e.stopPropagation()
			closeEverything()
		}
	}
	document.addEventListener('keydown', listeningKeys, true)

	stt = createStt({
		onInterim(text) {
			interim = text
			showPanel(rect, `🎤 Listening… "${interim}"`)
		},
		onFinal(text) {
			void generateVisualization(rect, matches, text)
		},
		onError(message) {
			showPanel(rect, `⚠️ ${message}`)
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
 * Relayed through background.js rather than called directly - the API
 * key(s) live in chrome.storage.local, and a visited page's own JS context
 * (where this content script runs) has no business touching them.
 */
async function generateVisualization(rect: DOMRect, matches: Match[], transcript: string) {
	const myRequest = ++requestId
	typedInput = null
	stopListeningKeys()
	const best = matches[0]
	const selection: Selection = {
		tag: best.el.tagName.toLowerCase(),
		id: best.el.id || undefined,
		classes: best.el.classList.length ? Array.from(best.el.classList) : undefined,
		preview: selectionText(best).slice(0, MODEL_TEXT_LIMIT),
	}
	const failureReport = (error: string) => buildReportPayload({ selection, transcript, html: '', error })
	showPanel(rect, transcript.trim() ? `⚙️ Generating: "${transcript}"` : '⚙️ Generating…')

	try {
		const imageBase64 = (await activeImagePromise) ?? undefined
		if (myRequest !== requestId) return
		const relay = (await chrome.runtime.sendMessage({
			type: 'generate',
			payload: { transcript, selection, imageBase64 },
		})) as GenerateRelayResponse
		if (myRequest !== requestId) return
		if (!relay.ok || !relay.action) {
			showPanel(rect, `⚠️ Generation failed: ${relay.error ?? 'unknown error'}`, failureReport(relay.error ?? 'unknown error'))
			return
		}
		if (relay.action._type !== 'createHtml') {
			showPanel(rect, '⚠️ Something went wrong - try again.', failureReport('Unexpected action type: ' + relay.action._type))
			return
		}
		showGeneratedVisualization(rect, relay.action, selection, transcript, imageBase64)
	} catch (e) {
		if (myRequest !== requestId) return
		showPanel(rect, `⚠️ ${e instanceof Error ? e.message : 'Generation failed'}`, failureReport(e instanceof Error ? e.message : 'Generation failed'))
	}
}

interface ReportBugRelayResponse {
	ok: boolean
	error?: string
}

/**
 * Beta-testing only: everything already in hand for a bug report, so the
 * reporter types nothing. Used by both the popup's button (a result that
 * looks wrong) and failure panels (generation failed, `error` set and `html`
 * empty) - the failures are the most informative reports.
 */
function buildReportPayload(fields: {
	selection: Selection
	transcript: string
	html: string
	error?: string
	runtimeErrors?: string
}): Record<string, string> {
	const { selection } = fields
	return {
		selectionTag: selection.tag,
		selectionId: selection.id ?? '',
		selectionClasses: selection.classes?.join(' ') ?? '',
		selectionPreview: selection.preview ?? '',
		transcript: fields.transcript.trim() || '(none - pressed Enter to just visualize the selection)',
		html: fields.html.slice(0, 20000),
		error: fields.error ?? '',
		runtimeErrors: fields.runtimeErrors || '(none observed)',
		pageUrl: location.href,
		pageTitle: document.title,
		timestamp: new Date().toISOString(),
		extensionVersion: chrome.runtime.getManifest().version,
		userAgent: navigator.userAgent,
	}
}

/**
 * Sends a report with no further input from the user. Falls back to a
 * clipboard copy if email sending isn't configured (emailjsConfig.ts not
 * filled in - see background.ts), so the button still does something useful
 * rather than failing silently during setup. The button is disabled while a
 * send is in flight (no double-send) and its label/title are restored after.
 */
async function sendBugReport(payload: Record<string, string>, btn: HTMLElement) {
	if (btn.dataset.sending === '1') return
	btn.dataset.sending = '1'
	const idleText = btn.textContent
	const idleTitle = btn.title
	const label = (icon: string) => {
		btn.textContent = idleText && idleText.length > 2 ? `${icon} ${idleText.slice(3)}` : icon
	}
	label('…')
	try {
		const relay = (await chrome.runtime.sendMessage({ type: 'report-bug', payload })) as ReportBugRelayResponse
		if (relay.ok) {
			label('✅')
		} else if (relay.error === 'not-configured') {
			await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
			label('📋')
			btn.title = 'Email reporting isn’t set up yet - copied the report to your clipboard instead'
		} else {
			console.error('[report-bug] send failed:', relay.error)
			label('⚠️')
		}
	} catch (e) {
		console.error('[report-bug] send failed:', e)
		label('⚠️')
	}
	setTimeout(() => {
		btn.textContent = idleText
		btn.title = idleTitle
		delete btn.dataset.sending
	}, 2000)
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
const REPORT_BTN_TITLE =
	'Report a problem (beta). Sends the developer: the page URL and title, what you circled, what you said, the generated HTML, any errors, and your browser version. Nothing is sent unless you click.'

function showGeneratedVisualization(
	selectionRect: DOMRect,
	action: GeneratedAction,
	selection: Selection,
	transcript: string,
	/** The original screenshot, if the selection needed vision - resent on every iteration. */
	imageBase64?: string
) {
	panelDragCleanup?.()
	panelVoiceCleanup?.()
	panelEl?.remove()

	const w = Math.max(200, Math.min(PANEL_W, window.innerWidth - 16))
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
		container.style.left = Math.max(8, Math.min(draggedPosition.left, window.innerWidth - w - 8)) + 'px'
	} else {
		container.style.top = Math.max(8, Math.min(selectionRect.bottom + 8, window.innerHeight - h - 8)) + 'px'
		container.style.left = Math.max(8, Math.min(selectionRect.left, window.innerWidth - w - 8)) + 'px'
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
		justifyContent: 'space-between',
		padding: '0 4px',
		boxSizing: 'border-box',
	})

	/**
	 * Beta-testing only: one click flags this result as broken and sends
	 * everything already in hand - no typing, since the whole point is
	 * catching what actually went wrong, which is already captured (see
	 * sendBugReport below). Remove this button, sendBugReport, and the
	 * emailjsConfig/report-bug plumbing in background.ts once the
	 * friends-testing window closes.
	 */
	const reportBtn = document.createElement('button')
	reportBtn.textContent = '🐛'
	reportBtn.title = REPORT_BTN_TITLE
	Object.assign(reportBtn.style, {
		border: 'none',
		background: 'transparent',
		borderRadius: '4px',
		width: '18px',
		height: '18px',
		cursor: 'pointer',
		fontSize: '11px',
		lineHeight: '1',
		transition: 'background-color 0.1s',
	})
	reportBtn.addEventListener('mouseenter', () => {
		reportBtn.style.background = 'rgba(255,255,255,0.15)'
	})
	reportBtn.addEventListener('mouseleave', () => {
		reportBtn.style.background = 'transparent'
	})
	reportBtn.addEventListener(
		'click',
		() =>
			void sendBugReport(
				buildReportPayload({
					selection,
					transcript: lastTranscript,
					html: currentHtml,
					runtimeErrors: runtimeErrors.join(String.fromCharCode(10)),
				}),
				reportBtn
			)
	)
	header.appendChild(reportBtn)

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
		transition: 'background-color 0.1s',
	})
	closeBtn.addEventListener('mouseenter', () => {
		closeBtn.style.background = 'rgba(255,255,255,0.15)'
	})
	closeBtn.addEventListener('mouseleave', () => {
		closeBtn.style.background = 'transparent'
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
	let lastTranscript = transcript
	// Reset on every fresh render (see loadVisualization) - render.ts forwards
	// any error the generated script throws, caught here so a bug report can
	// include what actually went wrong inside the sandboxed iframe, not just
	// what was asked for.
	let runtimeErrors: string[] = []
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
		runtimeErrors = []
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

	// A small pill right next to the mic, not a banner across the middle of
	// the visualization - the mic badge is already what your eye is on while
	// waiting (it's what you just released), so the status belongs right
	// beside it instead of competing for attention in the center.
	const generatingLabel = document.createElement('div')
	generatingLabel.textContent = 'Generating…'
	Object.assign(generatingLabel.style, {
		position: 'absolute',
		left: 6 + MIC_SIZE + 6 + 'px',
		bottom: '6px',
		height: MIC_SIZE + 'px',
		lineHeight: MIC_SIZE + 'px',
		padding: '0 10px',
		borderRadius: MIC_SIZE / 2 + 'px',
		background: 'rgba(0,0,0,0.72)',
		color: 'white',
		fontFamily: 'system-ui, sans-serif',
		fontSize: '11px',
		whiteSpace: 'nowrap',
		boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
		pointerEvents: 'none',
		zIndex: '1',
		display: 'none',
	})

	// Faint "Hold V to speak" next to the mic, in the same spot as the status
	// pill - shown only when nothing else is (not generating, not recording,
	// text reply box closed), so it never stacks on top of real status.
	const voiceHint = document.createElement('div')
	voiceHint.textContent = 'Hold V to speak'
	Object.assign(voiceHint.style, {
		position: 'absolute',
		left: 6 + MIC_SIZE + 6 + 'px',
		bottom: '6px',
		height: MIC_SIZE + 'px',
		lineHeight: MIC_SIZE + 'px',
		color: 'rgba(30,30,30,0.5)',
		textShadow: '0 0 3px rgba(255,255,255,0.9)',
		fontFamily: 'system-ui, sans-serif',
		fontSize: '11px',
		whiteSpace: 'nowrap',
		pointerEvents: 'none',
		zIndex: '1',
	})

	// Bottom-right: the typed alternative to hold-V for follow-up requests.
	const respondBtn = document.createElement('button')
	respondBtn.type = 'button'
	respondBtn.textContent = '⌨️ Respond'
	Object.assign(respondBtn.style, {
		position: 'absolute',
		right: '6px',
		bottom: '6px',
		height: MIC_SIZE + 'px',
		padding: '0 9px',
		border: 'none',
		borderRadius: MIC_SIZE / 2 + 'px',
		background: 'rgba(0,0,0,0.72)',
		color: 'white',
		fontFamily: 'system-ui, sans-serif',
		fontSize: '11px',
		cursor: 'pointer',
		boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
		zIndex: '1',
	})

	const replyBox = document.createElement('input')
	replyBox.type = 'text'
	replyBox.placeholder = 'Ask for a change and press Enter (Esc to close)'
	Object.assign(replyBox.style, {
		position: 'absolute',
		left: 6 + MIC_SIZE + 6 + 'px',
		right: '6px',
		bottom: '6px',
		height: MIC_SIZE + 4 + 'px',
		boxSizing: 'border-box',
		padding: '0 9px',
		border: '1px solid rgba(0,0,0,0.25)',
		borderRadius: (MIC_SIZE + 4) / 2 + 'px',
		background: 'rgba(255,255,255,0.97)',
		color: '#111',
		fontFamily: 'system-ui, sans-serif',
		fontSize: '12px',
		outline: 'none',
		boxShadow: '0 1px 6px rgba(0,0,0,0.3)',
		zIndex: '2',
		display: 'none',
	})
	// Keep the page's own shortcuts (and hold-V) from firing while typing here.
	for (const type of ['keydown', 'keyup', 'keypress']) {
		replyBox.addEventListener(type, (e) => e.stopPropagation())
	}

	function refreshHint() {
		const busy = generatingLabel.style.display !== 'none' || iterateStt !== null || replyBox.style.display !== 'none'
		voiceHint.style.display = busy ? 'none' : 'block'
		respondBtn.style.display = replyBox.style.display !== 'none' ? 'none' : 'block'
	}
	function closeReplyBox() {
		replyBox.value = ''
		replyBox.style.display = 'none'
		refreshHint()
	}
	respondBtn.addEventListener('click', () => {
		replyBox.style.display = 'block'
		refreshHint()
		replyBox.focus()
	})
	replyBox.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			closeReplyBox()
		} else if (e.key === 'Enter' && replyBox.value.trim()) {
			const text = replyBox.value.trim()
			closeReplyBox()
			void iterateVisualization(text)
		}
	})
	replyBox.addEventListener('blur', () => {
		if (!replyBox.value.trim()) closeReplyBox()
	})

	let iterateStt: SttEngineInstance | null = null
	let labelTimer: ReturnType<typeof setTimeout> | undefined

	/** Shows an error in the same pill as "Generating…" for a few seconds. */
	function showIterateError(message: string) {
		if (popupClosed) return
		clearTimeout(labelTimer)
		generatingLabel.textContent = message
		generatingLabel.style.background = 'rgba(185,28,28,0.92)'
		generatingLabel.style.display = 'block'
		refreshHint()
		labelTimer = setTimeout(hideLabel, 4000)
	}
	function hideLabel() {
		generatingLabel.style.display = 'none'
		generatingLabel.textContent = 'Generating…'
		generatingLabel.style.background = 'rgba(0,0,0,0.72)'
		refreshHint()
	}
	// Set when this popup is closed/replaced; an iteration response that
	// arrives afterward (or after a newer iteration started) is dropped.
	let popupClosed = false
	let iterationId = 0
	// One automatic retry when a Mermaid diagram fails to parse (render.ts
	// reports it); reset whenever the user asks for something themselves, so a
	// broken repair can't loop.
	let autoRepairsLeft = 1

	async function iterateVisualization(transcript: string, options: { repairLabel?: string } = {}) {
		if (popupClosed) return
		const myIteration = ++iterationId
		clearTimeout(labelTimer)
		hideLabel()
		if (options.repairLabel) {
			generatingLabel.textContent = options.repairLabel
		} else {
			lastTranscript = transcript
			autoRepairsLeft = 1
		}
		generatingLabel.style.display = 'block'
		refreshHint()
		let failed = false
		try {
			const relay = (await chrome.runtime.sendMessage({
				type: 'generate',
				payload: { transcript, selection, previousHtml: currentHtml, imageBase64 },
			})) as GenerateRelayResponse
			if (popupClosed || myIteration !== iterationId) return
			if (!relay.ok || !relay.action || relay.action._type !== 'createHtml') {
				console.error('[iterate] generation failed:', relay.error ?? relay.action?._type)
				failed = true
				showIterateError(relay.error ?? 'Generation failed')
				return
			}
			currentHtml = relay.action.html
			loadVisualization()
		} catch (e) {
			// A failed iteration just leaves the existing visualization showing -
			// there's no status panel for this path, so this is logged rather
			// than surfaced, but logged so a failure is at least diagnosable.
			console.error('[iterate] request failed:', e)
			failed = true
			showIterateError(e instanceof Error ? e.message : 'Request failed')
		} finally {
			if (!failed && !popupClosed && myIteration === iterationId) hideLabel()
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
				showIterateError(message)
				micBadge.style.background = '#d97706'
				setTimeout(() => {
					micBadge.style.background = '#8a8a8a'
				}, 600)
			},
			onEnd() {
				iterateStt = null
				micBadge.style.background = '#8a8a8a'
				refreshHint()
				// Releasing V calls stop() immediately, which can race the Web
				// Speech API's own finalization - if nothing was ever marked
				// final, fall back to whatever interim text it had so far rather
				// than silently dropping the request (confirmed cause of "nothing
				// happens" when V is released right after speaking).
				if (!gotFinal && interimText.trim()) void iterateVisualization(interimText.trim())
			},
		})
		refreshHint()
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
	function onIframeMessage(e: MessageEvent) {
		if (e.source !== iframe.contentWindow) return
		// The iframe runs model-written code, so its message is untrusted: only
		// honor it while the cursor is actually over this popup (hovering the
		// iframe counts as hovering the container), same as the top-page path -
		// otherwise generated code could open the mic on its own.
		if (e.data?.type === 'iterate-key-down') {
			if (!iterateStt && container.matches(':hover')) startIterateCapture()
		} else if (e.data?.type === 'iterate-key-up') stopIterateCapture()
		else if (e.data?.type === 'runtime-error' && typeof e.data.message === 'string') {
			// Capped so one chatty visualization (e.g. an error in a loop) can't
			// grow this without bound - a bug report only needs a sample, not
			// every repetition.
			runtimeErrors.push(e.data.message)
			if (runtimeErrors.length > 10) runtimeErrors.shift()
		} else if (e.data?.type === 'mermaid-error' && typeof e.data.message === 'string') {
			requestAutoRepair(
				`Mermaid parse error: ${e.data.message}`,
				'The Mermaid diagram in your previous HTML failed to parse and rendered as an error. ' +
					`Parser error: ${e.data.message.slice(0, 500)}\n` +
					'Fix only the Mermaid syntax - wrap every node label in double quotes, and use plain text or ' +
					'Unicode (x̄, x₁, ≤) instead of $ math inside the diagram - and keep everything else the same.',
				'Fixing diagram…'
			)
		} else if (e.data?.type === 'blank-render' && typeof e.data.message === 'string') {
			requestAutoRepair(
				`Blank render: ${e.data.message}`,
				'Your previous HTML rendered as a blank page: ' +
					`${e.data.message.slice(0, 300)} Something in the layout hides the content (for example a parent ` +
					'with display:none, or hand-written tabs whose panels never show). Fix the layout so the content ' +
					'is visible - use the vendored tabs helper (<div data-tabs> with <section data-tab="...">) for ' +
					'tabs - and keep the content itself the same.',
				'Fixing layout…'
			)
		}
	}

	/**
	 * Problems render.ts detects after drawing (an unparseable diagram, a blank
	 * page) get one automatic model repair per user request - the iframe runs
	 * model-written code, so its messages are untrusted, and the budget keeps a
	 * misbehaving page from triggering more than one extra call.
	 */
	function requestAutoRepair(errorForReport: string, instruction: string, label: string) {
		runtimeErrors.push(errorForReport)
		if (runtimeErrors.length > 10) runtimeErrors.shift()
		if (autoRepairsLeft <= 0) return
		autoRepairsLeft--
		void iterateVisualization(instruction, { repairLabel: label })
	}
	document.addEventListener('keydown', onIterateKeyDown)
	document.addEventListener('keyup', onIterateKeyUp)
	window.addEventListener('message', onIframeMessage)
	panelVoiceCleanup = () => {
		popupClosed = true
		document.removeEventListener('keydown', onIterateKeyDown)
		document.removeEventListener('keyup', onIterateKeyUp)
		window.removeEventListener('message', onIframeMessage)
		iterateStt?.abort()
		iterateStt = null
	}

	container.appendChild(header)
	container.appendChild(iframe)
	container.appendChild(micBadge)
	container.appendChild(generatingLabel)
	container.appendChild(voiceHint)
	container.appendChild(respondBtn)
	container.appendChild(replyBox)
	refreshHint()
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
function showPanel(selectionRect: DOMRect, text: string, reportPayload?: Record<string, string>) {
	panelDragCleanup?.()
	panelVoiceCleanup?.()
	panelVoiceCleanup = null
	panelEl?.remove()
	// Never wider than the viewport minus an 8px gutter each side.
	const panelMaxWidth = Math.max(160, Math.min(420, window.innerWidth - 16))
	const panel = document.createElement('div')
	Object.assign(panel.style, {
		position: 'fixed',
		zIndex: '2147483647',
		maxWidth: panelMaxWidth + 'px',
		background: '#1c1c1f',
		color: '#e5e5e5',
		padding: '12px 14px',
		borderRadius: '10px',
		borderLeft: '3px solid #3b82f6',
		fontFamily: 'system-ui, sans-serif',
		fontSize: '12.5px',
		lineHeight: '1.6',
		boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
		whiteSpace: 'pre-wrap',
		overflowY: 'auto',
	})

	if (draggedPosition) {
		panel.style.top = draggedPosition.top + 'px'
		panel.style.left = Math.max(8, Math.min(draggedPosition.left, window.innerWidth - panelMaxWidth - 8)) + 'px'
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
		panel.style.left = Math.max(8, Math.min(selectionRect.left, window.innerWidth - panelMaxWidth - 8)) + 'px'
	}

	panel.textContent = text
	const keepFocus = typedInput?.contains(document.activeElement) ? document.activeElement : null
	if (typedInput) panel.appendChild(typedInput)
	if (reportPayload) {
		// Failure panels get the same one-click report as a successful popup -
		// failures are the most informative thing to learn about.
		const btn = document.createElement('button')
		btn.textContent = '🐛 Report this problem'
		btn.title = REPORT_BTN_TITLE
		Object.assign(btn.style, {
			display: 'block',
			marginTop: '8px',
			padding: '3px 10px',
			border: '1px solid rgba(255,255,255,0.3)',
			borderRadius: '6px',
			background: 'transparent',
			color: '#e5e5e5',
			fontFamily: 'inherit',
			fontSize: '12px',
			cursor: 'pointer',
		})
		btn.addEventListener('click', () => void sendBugReport(reportPayload, btn))
		panel.appendChild(btn)
	}
	document.documentElement.appendChild(panel)
	panelEl = panel
	panel.scrollTop = panel.scrollHeight
	if (keepFocus instanceof HTMLElement) keepFocus.focus()
	panelDragCleanup = makeDraggable(panel)
}

/**
 * This file is injected on demand (background.ts), possibly more than once
 * into the same tab, and each injection gets a fresh copy of this module's
 * state. Only the most recent copy's listener may stay registered, or one
 * shortcut press would toggle several overlays at once - so each injection
 * removes the previous copy's listener (best effort: a copy orphaned by an
 * extension reload may throw, which is fine) before adding its own.
 */
type ToggleListener = (message: { type?: string }) => void
const toggleHolder = window as unknown as { __studyBuddyToggle?: ToggleListener }

const onToggleMessage: ToggleListener = (message) => {
	if (message?.type !== 'toggle-overlay') return
	if (mode !== 'idle') closeEverything()
	else enterSelectMode()
}
if (toggleHolder.__studyBuddyToggle) {
	try {
		chrome.runtime.onMessage.removeListener(toggleHolder.__studyBuddyToggle)
	} catch {
		// previous copy's extension context is gone
	}
}
toggleHolder.__studyBuddyToggle = onToggleMessage
chrome.runtime.onMessage.addListener(onToggleMessage)
