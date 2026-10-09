/**
 * This page is declared under manifest.json's `sandbox.pages`, which gives
 * it a unique opaque origin and (unlike every other extension page) a
 * default CSP that allows inline scripts/eval - the documented Chrome
 * pattern for running untrusted/dynamic HTML inside an extension. That's
 * required here: the model's generated HTML is full of inline <script>
 * blocks (Chart.js setup, computed values, Stepper calls), which the
 * extension's normal `script-src 'self'` page CSP would silently block
 * entirely - confirmed from Chrome's own MV3 CSP docs, not guessed.
 *
 * Being a sandboxed page also means it's loaded from `chrome-extension://`,
 * not `srcdoc`/`data:`, so it does NOT inherit the embedding (visited)
 * page's CSP the way a plain srcdoc iframe would - confirmed live that a
 * strict-CSP site (GitHub) silently blocks all script execution, inline or
 * external, inside a srcdoc iframe, with the HTML still rendering but
 * nothing ever running.
 *
 * Sandboxed pages have no access to chrome.* APIs (by design - this is the
 * security boundary around untrusted generated code), so the HTML payload
 * can't be read from chrome.storage here. It arrives via postMessage from
 * the content script that created this iframe instead.
 */
/**
 * Forwards hold-V to the parent content script. Keydown/keyup events are
 * scoped to whichever document currently has focus and never cross a frame
 * boundary on their own - once the user clicks anything inside the generated
 * visualization (a chart, a button), focus moves into THIS document, and the
 * parent page's own keydown listener stops seeing V entirely. Capturing it
 * here too and relaying it closes that gap (confirmed bug report: hold-V
 * "only works if you don't click anything in between").
 */
function attachKeyForwarding() {
	document.addEventListener('keydown', (e) => {
		if (e.key.toLowerCase() !== 'v') return
		const active = document.activeElement
		const isTyping =
			active instanceof HTMLInputElement ||
			active instanceof HTMLTextAreaElement ||
			(active instanceof HTMLElement && active.isContentEditable)
		if (isTyping) return
		window.parent.postMessage({ type: 'iterate-key-down' }, '*')
	})
	document.addEventListener('keyup', (e) => {
		if (e.key.toLowerCase() !== 'v') return
		window.parent.postMessage({ type: 'iterate-key-up' }, '*')
	})
}

/**
 * Forwards any error the model's generated script throws - uncaught
 * exceptions and rejected promises alike - to the parent content script,
 * which attaches the latest few to a bug report if the user flags this
 * result. Without this, a crashing visualization just fails silently in a
 * sandboxed iframe no one's watching the console of.
 */
function attachErrorForwarding() {
	window.addEventListener('error', (e) => {
		window.parent.postMessage({ type: 'runtime-error', message: e.message }, '*')
	})
	window.addEventListener('unhandledrejection', (e) => {
		window.parent.postMessage({ type: 'runtime-error', message: `Unhandled rejection: ${e.reason}` }, '*')
	})
}

window.addEventListener('message', (event) => {
	const raw = (event.data as { html?: string } | undefined)?.html
	if (typeof raw !== 'string') return

	// document.write() needs a real `<!DOCTYPE html>` as the literal first
	// thing written, or the resulting document renders in quirks mode -
	// confirmed live (KaTeX refuses to run at all in quirks mode, logging
	// "KaTeX doesn't work in quirks mode. Make sure your website has a
	// suitable doctype." - silently breaking the whole visualization, not
	// just the math). The model isn't reliably told to include one, so this
	// strips whatever doctype (if any) it wrote and supplies a known-good one
	// itself rather than depending on the model's compliance.
	const html = raw.replace(/^\s*<!doctype[^>]*>/i, '').trimStart()

	document.open()
	document.write('<!DOCTYPE html>\n' + html)
	document.close()

	// document.open() tears down and rebuilds the document, including
	// whatever was listening on it - both forwarders have to run again after
	// the write, not just once at module load, or they never actually attach
	// to anything. The content script navigates this iframe fresh for every
	// render (initial and every hold-V iteration alike - see
	// content-script.ts's loadVisualization()), so this handler only ever
	// runs once per page instance in practice, but it's written to not
	// depend on that.
	attachKeyForwarding()
	attachErrorForwarding()
})
