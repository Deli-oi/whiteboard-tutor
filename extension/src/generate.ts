import { createGoogleGenerativeAI, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { generateText, LanguageModel, UserContent } from 'ai'
import { isQuotaExceededError, isRetryableApiError, toErrorWithMessage } from '../../shared/ai/modelErrors'
import { buildExtensionSystemPrompt, ExtensionCreateHtmlAction } from '../../shared/extension/createHtmlAction'
import { parseModelJson } from '../../shared/ai/parseModelJson'

const GEMINI_MODEL_ID = 'gemini-3.1-flash-lite'
// Groq's free tier moves fast (Llama 3.x/4 were free, now aren't) - gpt-oss-120b
// is the current free, strong, fast (~500 tok/s) option as of this writing.
// Confirmed text-only (no vision support), unlike Gemini.
const GROQ_MODEL_ID = 'openai/gpt-oss-120b'
const MAX_ATTEMPTS = 3
/** Per-attempt cap: a hung provider must surface an error, not "Generating..." forever. */
const ATTEMPT_TIMEOUT_MS = 45_000
export const TIMEOUT_MESSAGE = 'The model took too long to respond. Try again.'

function isTimeoutError(error: unknown): boolean {
	const name = (error as { name?: unknown } | undefined)?.name
	return name === 'TimeoutError' || name === 'AbortError'
}

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

/** Whichever of these the user has configured - at least one is required. */
export interface ProviderKeys {
	gemini?: string
	groq?: string
}

/**
 * Runs the full generate-parse-validate-retry cycle against one already-
 * constructed model. Three content-quality failure modes (unparseable JSON,
 * schema mismatch, suspiciously thin output) retry immediately - no backoff
 * needed, this isn't a rate-limit situation - while attempts remain, then
 * fall through and accept/surface whatever came back rather than retrying
 * forever. API-level errors (the catch block) go through the shared
 * quota/retryable classification instead, with backoff.
 */
async function attemptWithModel(
	model: LanguageModel,
	systemPrompt: string,
	content: UserContent,
	providerOptions?: Parameters<typeof generateText>[0]['providerOptions'],
	options: {
		/**
		 * Give up on a 429 immediately instead of retrying with backoff. Set when
		 * another provider is available to take over: per-minute rate limits
		 * rarely clear within a 0.5s/1s backoff, so the retries only add latency.
		 */
		failFastOnRateLimit?: boolean
	} = {}
): Promise<ExtensionCreateHtmlAction> {
	let lastError: unknown
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const result = await generateText({
				model,
				system: systemPrompt,
				messages: [{ role: 'user', content }],
				maxOutputTokens: 8192,
				abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
				...(providerOptions ? { providerOptions } : {}),
			})

			const actions = parseModelJson(result.text)?.actions
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
			if (isTimeoutError(error)) {
				// Not retried: another 45s wait is unlikely to go better, and the
				// caller can still fall through to the next provider.
				lastError = new Error(TIMEOUT_MESSAGE)
				break
			}
			lastError = error
			if (isQuotaExceededError(error)) break
			if (options.failFastOnRateLimit && (error as { statusCode?: unknown } | undefined)?.statusCode === 429) break
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
 * Bring-your-own-key generation, each user's own provider key(s) stored via
 * chrome.storage.local - no shared backend, no bill for anyone but the
 * key's owner. Gemini is the primary provider (vision-capable, used first
 * whenever a key is set); Groq (gpt-oss-120b, text-only) is a real fallback
 * if Gemini is unavailable - a daily quota cap or an outage, not just a
 * theoretical option the `ai` SDK happens to support - provided the request
 * doesn't need vision, which Groq's free model can't do.
 */
export async function generateVisualizationHtml(
	keys: ProviderKeys,
	transcript: string,
	selection: Selection,
	previousHtml?: string,
	imageBase64?: string
): Promise<ExtensionCreateHtmlAction> {
	if (!keys.gemini && !keys.groq) {
		throw new Error('No API key set. Right-click the extension icon → Options to add one.')
	}

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
	if (keys.gemini) {
		try {
			const model = createGoogleGenerativeAI({ apiKey: keys.gemini })(GEMINI_MODEL_ID)
			// With a Groq key set and no image (Groq can't take one), a Gemini 429
			// goes straight to the fallback instead of burning retries first.
			const groqCanTakeOver = !!keys.groq && !imageBase64
			return await attemptWithModel(
				model,
				systemPrompt,
				content,
				{ google: { thinkingConfig: { thinkingLevel: 'low' } } satisfies GoogleGenerativeAIProviderOptions },
				{ failFastOnRateLimit: groqCanTakeOver }
			)
		} catch (error) {
			lastError = error
		}
	}

	// Falls back to Groq when Gemini is unavailable (quota exhausted after
	// retries, or just not configured) - skipped for vision requests, since
	// gpt-oss-120b has no image support and would just fail a different way.
	if (keys.groq && !imageBase64) {
		try {
			const model = createGroq({ apiKey: keys.groq })(GROQ_MODEL_ID)
			return await attemptWithModel(model, systemPrompt, content)
		} catch (error) {
			lastError = error
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
