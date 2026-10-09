import { generateVisualizationHtml, Selection } from './generate'
import { EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID } from './emailjsConfig'

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
		// extension was loaded/reloaded. A manual refresh of the page fixes this;
		// not worth auto-injecting a content script just to cover that case.
	}
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
 * own API key(s) - no worker, no localhost dependency. Still a message
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
