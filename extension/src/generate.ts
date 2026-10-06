import { createGoogleGenerativeAI, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google'
import { generateText } from 'ai'
import { isQuotaExceededError, isRetryableApiError, toErrorWithMessage } from '../../shared/ai/modelErrors'
import { buildExtensionSystemPrompt, ExtensionCreateHtmlAction } from '../../shared/extension/createHtmlAction'
import { closeAndParseJson } from '../../shared/ai/closeAndParseJson'
import { normalizeModelText } from '../../shared/ai/normalizeModelText'

const MODEL_ID = 'gemini-3.1-flash-lite'
const MAX_ATTEMPTS = 3

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
	previousHtml?: string
): Promise<ExtensionCreateHtmlAction> {
	const google = createGoogleGenerativeAI({ apiKey })
	const model = google(MODEL_ID)

	const systemPrompt = buildExtensionSystemPrompt()
	const userMessage = [
		`Circled element: <${selection.tag}${selection.id ? ` id="${selection.id}"` : ''}${
			selection.classes?.length ? ` class="${selection.classes.join(' ')}"` : ''
		}>`,
		selection.preview ? `Its content: "${selection.preview}"` : null,
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

	let lastError: unknown
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const result = await generateText({
				model,
				system: systemPrompt,
				messages: [{ role: 'user', content: userMessage }],
				maxOutputTokens: 8192,
				providerOptions: {
					google: { thinkingConfig: { thinkingLevel: 'low' } } satisfies GoogleGenerativeAIProviderOptions,
				},
			})

			const partialObject = closeAndParseJson(normalizeModelText(result.text))
			const actions = partialObject?.actions
			if (!Array.isArray(actions) || actions.length === 0) {
				throw new Error("The model's response couldn't be understood. Try again.")
			}

			const validated = ExtensionCreateHtmlAction.safeParse(actions[0])
			if (!validated.success) {
				throw new Error("The model's response didn't match the expected shape. Try again.")
			}

			return validated.data
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
