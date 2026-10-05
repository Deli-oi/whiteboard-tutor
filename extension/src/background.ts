import { generateVisualizationHtml, Selection } from './generate'

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

interface GenerateMessage {
	type: 'generate'
	payload: { transcript: string; selection: Selection; previousHtml?: string }
}

export interface GenerateResponse {
	ok: boolean
	action?: { _type: string; html: string }
	error?: string
}

/**
 * Phase 5: generation happens right here in the background script, using the
 * user's own API key - no worker, no localhost dependency. Still a message
 * relay (not a direct call from the content script) because the content
 * script has no business holding the API key in a visited page's JS context.
 */
chrome.runtime.onMessage.addListener((message: GenerateMessage, _sender, sendResponse) => {
	if (message?.type !== 'generate') return false // not ours; let other listeners handle it

	;(async () => {
		try {
			const stored = await chrome.storage.local.get('geminiApiKey')
			const geminiApiKey = stored.geminiApiKey as string | undefined
			if (!geminiApiKey) {
				sendResponse({
					ok: false,
					error: 'No Gemini API key set. Right-click the extension icon → Options to add one.',
				} satisfies GenerateResponse)
				return
			}

			const action = await generateVisualizationHtml(
				geminiApiKey,
				message.payload.transcript,
				message.payload.selection,
				message.payload.previousHtml
			)
			sendResponse({ ok: true, action } satisfies GenerateResponse)
		} catch (e) {
			sendResponse({
				ok: false,
				error: e instanceof Error ? e.message : 'Generation failed',
			} satisfies GenerateResponse)
		}
	})()

	return true // keep the message channel open for the async sendResponse above
})
