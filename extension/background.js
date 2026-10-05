/**
 * Keyboard shortcuts fire here (chrome.commands only reaches the background
 * service worker, never a content script directly), so this just relays the
 * toggle to whichever tab is active.
 */
chrome.commands.onCommand.addListener(async (command) => {
	if (command !== 'toggle-overlay') return

	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	if (!tab?.id) return

	try {
		await chrome.tabs.sendMessage(tab.id, { type: 'toggle-overlay' })
	} catch {
		// No content script listening - most likely the page was open before the
		// extension was loaded/reloaded. A manual refresh of the page fixes this
		// (documented in extension/README.md); not worth auto-injecting for a
		// Phase 2 dev tool.
	}
})

const GENERATE_URL = 'http://localhost:5173/extension/generate'

/**
 * Phase 4.5: the content script now runs on any page, so it can no longer
 * just `fetch(location.origin + ...)` - that only ever worked because the
 * dev server's own test page happened to share an origin with the worker.
 * Relaying through the background service worker is the standard, reliable
 * MV3 pattern for reaching an origin other than the one the content script
 * is injected into: this fetch is governed by `host_permissions`
 * (localhost/127.0.0.1) and is never subject to the visited page's CSP,
 * unlike a fetch issued directly from the content script would be.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== 'generate') return false // not ours; let other listeners handle it

	;(async () => {
		try {
			const res = await fetch(GENERATE_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(message.payload),
			})
			sendResponse({ ok: res.ok, status: res.status, body: await res.text() })
		} catch (e) {
			sendResponse({
				ok: false,
				status: 0,
				body: e instanceof Error ? e.message : 'Could not reach the local dev server (is `npm run dev` running?)',
			})
		}
	})()

	return true // keep the message channel open for the async sendResponse above
})
