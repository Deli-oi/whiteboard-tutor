import { createGoogleGenerativeAI, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google'
import { generateText } from 'ai'
import { isQuotaExceededError, isRetryableApiError, toErrorWithMessage } from '../../shared/ai/modelErrors'
import { buildExtensionSystemPrompt, ExtensionCreateHtmlAction } from '../../shared/extension/createHtmlAction'
import { closeAndParseJson } from '../../shared/ai/closeAndParseJson'
import { normalizeModelText } from '../../shared/ai/normalizeModelText'

const MODEL_ID = 'gemini-3.1-flash-lite'
const MAX_ATTEMPTS = 3

/**
 * Deliberately conservative - a legitimately short real answer (a one-line
 * explanation, a single small formula) is common and shouldn't be penalized.
 * This only catches the extreme, near-empty case: a bare caption with no
 * real content, confirmed live as something the model occasionally returns.
 */
const MIN_PLAUSIBLE_HTML_LENGTH = 80

export function isSuspiciouslyThin(html: string): boolean {
	return html.trim().length < MIN_PLAUSIBLE_HTML_LENGTH
}

export interface Selection {
	tag: string
	id?: string
	classes?: string[]
	preview?: string
}

/**
 * Phase 5 of the extension pivot: generation moves out of the worker and
 * into the extension itself - each user supplies their own Gemini API key
 * (options.ts, stored via chrome.storage.local), so there's no shared
 * backend and no bill for anyone but the key's owner. Reuses the worker's
 * hard-won prompt text (shared/extension/createHtmlAction.ts) and parsing
 * helpers (worker/do/*.ts, both already pure/dependency-free) unchanged -
 * only the model-calling glue is new.
 */
export async function generateVisualizationHtml(
	apiKey: string,
	transcript: string,
	selection: Selection,
	previousHtml?: string,
	imageBase64?: string
): Promise<ExtensionCreateHtmlAction> {
	const google = createGoogleGenerativeAI({ apiKey })
	const model = google(MODEL_ID)

	const systemPrompt = buildExtensionSystemPrompt()
	const userMessage = [
		`Circled element: <${selection.tag}${selection.id ? ` id="${selection.id}"` : ''}${
			selection.classes?.length ? ` class="${selection.classes.join(' ')}"` : ''
		}>`,
		selection.preview ? `Its content: "${selection.preview}"` : null,
		// Triggered client-side (content-script.ts) whenever the circled
		// element's own text content was empty or it's an image/canvas/svg -
		// covers actual images, and canvas-rendered text (Google Docs draws
		// its document onto <canvas>, so there's no real DOM text to read at
		// all) uniformly, without needing to special-case either.
		imageBase64
			? 'A screenshot of exactly the circled region is attached - it may contain an image, a diagram, or text rendered in a way that has no readable DOM text (e.g. drawn on a canvas). Read it visually.'
			: null,
		// Hold-V-while-hovering lets the user iterate on a result they're
		// already looking at (content-script.ts's showGeneratedVisualization) -
		// when that's what's happening, the model should adjust what's there
		// rather than starting over from the original circled element.
		previousHtml
			? `This is a follow-up request refining a visualization you already created for this same circled element - the user wants it adjusted, not rebuilt from scratch, unless they clearly ask for something different. Its current HTML:\n---\n${previousHtml}\n---`
			: null,
		`What the user said they want: "${transcript}"`,
	]
		.filter(Boolean)
		.join('\n')

	const content = imageBase64
		? [
				{ type: 'text' as const, text: userMessage },
				{ type: 'image' as const, image: imageBase64 },
			]
		: userMessage

	let lastError: unknown
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const result = await generateText({
				model,
				system: systemPrompt,
				messages: [{ role: 'user', content }],
				maxOutputTokens: 8192,
				providerOptions: {
					google: { thinkingConfig: { thinkingLevel: 'low' } } satisfies GoogleGenerativeAIProviderOptions,
				},
			})

			// Three content-quality failure modes, all handled the same way: the
			// call itself succeeded, but what came back isn't usable - retry
			// immediately (no backoff needed, this isn't a rate-limit situation)
			// while attempts remain, otherwise fall through and surface the last
			// one. Previously only API-level errors (the catch block below) got
			// retried at all - an unparseable or schema-invalid response threw a
			// plain Error that didn't match isRetryableApiError's pattern, so it
			// burned the whole interaction on attempt 1 with no retry.
			const partialObject = closeAndParseJson(normalizeModelText(result.text))
			const actions = partialObject?.actions
			if (!Array.isArray(actions) || actions.length === 0) {
				lastError = new Error("The model's response couldn't be understood. Try again.")
				if (attempt < MAX_ATTEMPTS) continue
				break
			}

			const validated = ExtensionCreateHtmlAction.safeParse(actions[0])
			if (!validated.success) {
				lastError = new Error("The model's response didn't match the expected shape. Try again.")
				if (attempt < MAX_ATTEMPTS) continue
				break
			}

			const html = repairUnescapedLatexBackslashes(validated.data.html)
			// Confirmed live: the model occasionally returns a genuinely
			// near-empty response that still passes schema validation (e.g. a
			// bare caption, no real content) - worth one retry rather than
			// accepting the first thing that happens to parse. On the last
			// attempt, a thin result still beats throwing an error.
			if (isSuspiciouslyThin(html) && attempt < MAX_ATTEMPTS) {
				lastError = new Error("The model's response was suspiciously thin. Try again.")
				continue
			}

			return { ...validated.data, html }
		} catch (error) {
			lastError = error
			if (isQuotaExceededError(error)) break
			if (attempt < MAX_ATTEMPTS && isRetryableApiError(error)) {
				await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
				continue
			}
			break
		}
	}

	throw toErrorWithMessage(lastError)
}

/**
 * Fixes a specific, confirmed-live JSON-escaping failure mode: a LaTeX
 * command like \bar or \frac needs its backslash doubled to survive the
 * model's own JSON output (see createHtmlAction.ts's prompt) - when the
 * model doesn't double it, \b and \f are themselves VALID JSON escapes
 * (backspace/form feed), so JSON.parse doesn't error, it silently turns
 * the whole two-character escape into one invisible control character
 * instead (confirmed live: "\bar{g}" rendered as a box glyph then "ar{g}").
 * Only those two are repaired here - never \n/\r/\t, which are extremely
 * common and legitimate in real generated HTML formatting; repairing those
 * would corrupt normal content instead of fixing anything.
 */
export function repairUnescapedLatexBackslashes(html: string): string {
	return html.replace(/\x08/g, '\\b').replace(/\x0c/g, '\\f')
}
