import { generateVisualizationHtml, Selection } from './generate'
import { EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID } from './emailjsConfig'

/**
 * By default chrome.storage.local is readable from content scripts too, i.e.
 * from inside every page the extension runs on. The API keys live there, so
 * restrict it to trusted contexts (background, options page) only. Wrapped
 * defensively: older Chrome versions lack the method.
 */
try {
	void chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
} catch (e) {
	console.warn('[study-buddy] could not restrict storage access level:', e)
}

/**
 * Onboarding: a fresh install has no in-product hint that an API key is
 * required before anything works, or that the keyboard shortcut even
 * exists - `reason === 'install'` (not 'update', so reloading the
 * unpacked extension during development doesn't keep reopening this)
 * opens the options page once, right away, instead of leaving the user to
 * discover both on their own.
 */
chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason !== 'install') return
	chrome.runtime.openOptionsPage()
})

/**
 * Toggles circle-select in a tab. Both entry points - the keyboard shortcut
 * and clicking the toolbar icon - grant `activeTab` for that tab, which covers
 * injecting the content script and the later captureVisibleTab. The content
 * script is not declared in the manifest: it is injected on demand, only into
 * that tab, which also makes it work on tabs that were open before the
 * extension was installed or reloaded.
 *
 * Try the message first and inject only if nobody answers - covers a fresh
 * tab, a tab whose old content script was orphaned by an extension reload,
 * and avoids re-injecting on every press.
 */
async function toggleOverlay(tabId: number) {
	try {
		await chrome.tabs.sendMessage(tabId, { type: 'toggle-overlay' })
		return
	} catch {
		// No content script listening yet - inject it below.
	}

	try {
		await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] })
		await chrome.tabs.sendMessage(tabId, { type: 'toggle-overlay' })
	} catch (e) {
		// Chrome refuses injection on chrome:// pages, the Chrome Web Store, and
		// Chrome's built-in PDF viewer - say so on the toolbar icon for a moment
		// instead of failing silently.
		console.warn('[study-buddy] cannot run on this page:', e)
		void chrome.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' })
		void chrome.action.setBadgeText({ tabId, text: '✕' })
		void chrome.action.setTitle({ tabId, title: "Chrome doesn't allow extensions on this page" })
		setTimeout(() => {
			void chrome.action.setBadgeText({ tabId, text: '' })
			void chrome.action.setTitle({ tabId, title: '' })
		}, 4000)
	}
}

/** Keyboard shortcut (chrome.commands only reaches the background service worker). */
chrome.commands.onCommand.addListener(async (command) => {
	if (command !== 'toggle-overlay') return
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	if (tab?.id) await toggleOverlay(tab.id)
})

/** Clicking the toolbar icon - the discoverable way in, for anyone who doesn't know the shortcut. */
chrome.action.onClicked.addListener((tab) => {
	if (tab.id) void toggleOverlay(tab.id)
})

interface GenerateMessage {
	type: 'generate'
	payload: { transcript: string; selection: Selection; previousHtml?: string; imageBase64?: string }
}

interface CaptureTabMessage {
	type: 'capture-tab'
}

export interface CaptureTabResponse {
	ok: boolean
	dataUrl?: string
	error?: string
}

/**
 * The image/vision fix: a content script can't screenshot anything itself
 * (no such API), and `captureVisibleTab` is background/popup-only anyway -
 * relayed the same way `generate` already is. Capturing happens right when
 * the circle-select box is finalized (content-script.ts), not later once
 * speech finishes, so the captured pixels always match what was actually
 * circled even if the page scrolls while the user is still talking.
 */
chrome.runtime.onMessage.addListener((message: CaptureTabMessage, _sender, sendResponse) => {
	if (message?.type !== 'capture-tab') return false

	;(async () => {
		try {
			const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
			sendResponse({ ok: true, dataUrl } satisfies CaptureTabResponse)
		} catch (e) {
			sendResponse({
				ok: false,
				error: e instanceof Error ? e.message : 'Screen capture failed',
			} satisfies CaptureTabResponse)
		}
	})()

	return true
})

export interface GenerateResponse {
	ok: boolean
	action?: { _type: string; html: string }
	error?: string
}

/**
 * Generation happens right here in the background script, using the user's
 * own API key(s), with no server in between. It's a message
 * relay (not a direct call from the content script) because the content
 * script has no business holding API keys in a visited page's JS context.
 * Gemini is primary (vision-capable); Groq is a real fallback if Gemini is
 * unavailable, not just a theoretical option - generateVisualizationHtml
 * owns that logic, this just passes through whichever key(s) are set.
 */
chrome.runtime.onMessage.addListener((message: GenerateMessage, _sender, sendResponse) => {
	if (message?.type !== 'generate') return false // not ours; let other listeners handle it

	;(async () => {
		try {
			const stored = await chrome.storage.local.get(['geminiApiKey', 'groqApiKey'])
			const action = await generateVisualizationHtml(
				{ gemini: stored.geminiApiKey as string | undefined, groq: stored.groqApiKey as string | undefined },
				message.payload.transcript,
				message.payload.selection,
				message.payload.previousHtml,
				message.payload.imageBase64
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

interface ReportBugMessage {
	type: 'report-bug'
	payload: Record<string, string>
}

export interface ReportBugResponse {
	ok: boolean
	error?: string
}

/**
 * Beta-only, temporary: one click on the generated-visualization popup's bug
 * button sends everything already in hand (selection, transcript, the HTML
 * the model wrote, any runtime errors it threw) straight to the developer's
 * own inbox via EmailJS - a client-side email relay, not a backend of ours.
 * No-ops with ok:false/'not-configured' until emailjsConfig.ts is filled in
 * (see the doc comment there); content-script.ts falls back to copying
 * the report to the clipboard in that case. Remove this handler, the
 * content-script button, and emailjsConfig.ts once the testing window closes.
 */
chrome.runtime.onMessage.addListener((message: ReportBugMessage, _sender, sendResponse) => {
	if (message?.type !== 'report-bug') return false

	;(async () => {
		if (!EMAILJS_SERVICE_ID || !EMAILJS_PUBLIC_KEY) {
			sendResponse({ ok: false, error: 'not-configured' } satisfies ReportBugResponse)
			return
		}
		try {
			const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					service_id: EMAILJS_SERVICE_ID,
					template_id: EMAILJS_TEMPLATE_ID,
					user_id: EMAILJS_PUBLIC_KEY,
					template_params: message.payload,
				}),
			})
			sendResponse({
				ok: res.ok,
				error: res.ok ? undefined : await res.text(),
			} satisfies ReportBugResponse)
		} catch (e) {
			sendResponse({
				ok: false,
				error: e instanceof Error ? e.message : 'Failed to send',
			} satisfies ReportBugResponse)
		}
	})()

	return true
})
