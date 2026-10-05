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
