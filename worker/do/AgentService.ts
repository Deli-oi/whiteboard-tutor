import { AnthropicProvider, AnthropicProviderOptions, createAnthropic } from '@ai-sdk/anthropic'
import {
	createGoogleGenerativeAI,
	GoogleGenerativeAIProvider,
	GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google'
import { createGroq, GroqProvider, GroqProviderOptions } from '@ai-sdk/groq'
import { createOpenAI, OpenAIProvider, OpenAIResponsesProviderOptions } from '@ai-sdk/openai'
import { LanguageModel, ModelMessage, streamText } from 'ai'
import {
	AgentModelDefinition,
	AgentModelName,
	getAgentModelDefinition,
	isValidModelName,
} from '../../shared/models'
import { DebugPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentAction } from '../../shared/types/AgentAction'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { AgentUsage } from '../../shared/types/AgentUsage'
import { Streaming } from '../../shared/types/Streaming'
import { Environment } from '../environment'
import { buildMessages } from '../prompt/buildMessages'
import { buildSystemPrompt } from '../prompt/buildSystemPrompt'
import { getModelName } from '../prompt/getModelName'
import { closeAndParseJson } from './closeAndParseJson'
import { normalizeModelText } from './normalizeModelText'

export class AgentService {
	openai: OpenAIProvider
	anthropic: AnthropicProvider
	google: GoogleGenerativeAIProvider
	groq: GroqProvider

	constructor(env: Environment) {
		this.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
		this.anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
		this.google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })
		this.groq = createGroq({ apiKey: env.GROQ_API_KEY })
	}

	getModel(modelName: AgentModelName): LanguageModel {
		const modelDefinition = getAgentModelDefinition(modelName)
		const provider = modelDefinition.provider
		return this[provider](modelDefinition.id)
	}

	async *stream(prompt: AgentPrompt): AsyncGenerator<AgentStreamEvent> {
		try {
			for await (const event of this.streamActions(prompt)) {
				yield event
			}
		} catch (error: any) {
			console.error('Stream error:', error)
			throw error
		}
	}

	private async *streamActions(prompt: AgentPrompt): AsyncGenerator<AgentStreamEvent> {
		const modelName = getModelName(prompt)
		const model = this.getModel(modelName)

		if (typeof model === 'string') {
			throw new Error('Model is a string, not a LanguageModel')
		}

		const { modelId, provider } = model
		if (!isValidModelName(modelId)) {
			throw new Error(`Model ${modelId} is not in AGENT_MODEL_DEFINITIONS`)
		}

		const modelDefinition = getAgentModelDefinition(modelId)
		const systemPrompt = buildSystemPrompt(prompt)

		// Tutor mode is latency- and cost-sensitive: short spoken sentences plus a
		// dozen shapes don't need deep reasoning or a huge output budget.
		const isTutor = prompt.mode?.modeType === 'tutor'

		// Build messages with provider-specific options
		const messages: ModelMessage[] = []

		// Add system prompt with Anthropic caching if applicable
		if (provider === 'anthropic.messages') {
			// Anthropic requires explicit cache breakpoints. We set one at the end of the
			// system prompt to cache all system content (which generally changes together).
			messages.push({
				role: 'system',
				content: systemPrompt,
				providerOptions: {
					anthropic: { cacheControl: { type: 'ephemeral' } },
				},
			})
		} else {
			messages.push({
				role: 'system',
				content: systemPrompt,
			})
		}

		// Add prompt messages
		const promptMessages = buildMessages(prompt)
		messages.push(...promptMessages)

		// Check for debug flags and log if enabled
		const debugPart = prompt.debug as DebugPart | undefined
		if (debugPart) {
			if (debugPart.logSystemPrompt) {
				const promptWithoutSchema = buildSystemPrompt(prompt, { withSchema: false })
				console.log('[DEBUG] System Prompt (without schema):\n', promptWithoutSchema)
			}
			if (debugPart.logMessages) {
				console.log('[DEBUG] Messages:\n', JSON.stringify(promptMessages, null, 2))
			}
		}

		// Prefill the assistant turn to force the JSON start, where the model allows it.
		// Opus 4.7+ and Sonnet 4.6 reject last-assistant-turn prefills (400), so skip it there.
		if (modelDefinition.supportsPrefill) {
			messages.push({
				role: 'assistant',
				content: '{"actions": [{"_type":',
			})
		}

		try {
			// Groq's current free-tier models are all reasoning models: their chain-of-
			// thought counts against maxOutputTokens before any visible JSON is emitted,
			// so tutor mode's tight 4096 cap can be exhausted by reasoning alone. Give
			// Groq more headroom regardless of mode (still free; gpt-oss-120b allows up
			// to 65536).
			const maxOutputTokens =
				modelDefinition.provider === 'groq' ? 8192 : isTutor ? 4096 : 8192

			const canForceResponseStart =
				(provider === 'anthropic.messages' || provider === 'google.generative-ai') &&
				modelDefinition.supportsPrefill

			// @ai-sdk/google never sets `isRetryable` on its errors (confirmed by reading
			// its source), so the AI SDK's own automatic retry never fires for Gemini's
			// transient "model is overloaded" 503s - they'd otherwise go straight to the
			// user on the very first hiccup. Retry those ourselves, but only while nothing
			// has been yielded yet this attempt: once real content has streamed out to the
			// caller, retrying from scratch would risk duplicating canvas actions.
			const MAX_ATTEMPTS = 4
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				// The AI SDK does not make a failed API call throw out of the `textStream`
				// iterator below (it just ends the stream early) - it only reports the
				// failure through this callback and through the `usage`/`providerMetadata`
				// promises rejecting. Capture it here so we can surface it as a real error
				// after the loop, instead of silently finishing with zero actions.
				let capturedError: unknown = null
				const { textStream, usage, providerMetadata } = streamText({
					model,
					messages,
					maxOutputTokens,
					// Opus 4.7+ removed `temperature` (and top_p/top_k); sending it returns a 400.
					...(modelDefinition.supportsTemperature ? { temperature: 0 } : {}),
					providerOptions: getProviderOptions(modelDefinition, isTutor),
					onAbort() {
						console.warn('Stream actions aborted')
					},
					onError: ({ error }) => {
						console.error(`Stream text error (attempt ${attempt}/${MAX_ATTEMPTS}):`, error)
						capturedError = error
					},
				})

				let buffer = canForceResponseStart ? '{"actions": [{"_type":' : ''
				let cursor = 0
				let maybeIncompleteAction: AgentAction | null = null

				let startTime = Date.now()
				for await (const text of textStream) {
					buffer += text
					const partialObject = closeAndParseJson(normalizeModelText(buffer))
					if (!partialObject) continue

					const actions = partialObject.actions
					if (!Array.isArray(actions)) continue
					if (actions.length === 0) continue

					// If the events list is ahead of the cursor, we know we've completed the current event
					// We can complete the event and move the cursor forward
					if (actions.length > cursor) {
						const action = actions[cursor - 1] as AgentAction
						if (action) {
							yield {
								...action,
								complete: true,
								time: Date.now() - startTime,
							}
							maybeIncompleteAction = null
						}
						cursor++
					}

					// Now let's check the (potentially new) current event
					// And let's yield it in its (potentially incomplete) state
					const action = actions[cursor - 1] as AgentAction
					if (action) {
						// If we don't have an incomplete event yet, this is the start of a new one
						if (!maybeIncompleteAction) {
							startTime = Date.now()
						}

						maybeIncompleteAction = action

						// Yield the potentially incomplete event
						yield {
							...action,
							complete: false,
							time: Date.now() - startTime,
						}
					}
				}

				// If we've finished receiving events, but there's still an incomplete event, we need to complete it
				if (maybeIncompleteAction) {
					yield {
						...maybeIncompleteAction,
						complete: true,
						time: Date.now() - startTime,
					}
				}

				if (debugPart?.logMessages) {
					console.log('[DEBUG] Raw model output:\n', buffer)
				}

				const nothingYieldedYet = cursor === 0 && !maybeIncompleteAction

				if (capturedError) {
					if (nothingYieldedYet && isRetryableApiError(capturedError) && attempt < MAX_ATTEMPTS) {
						const delayMs = 500 * attempt
						console.warn(
							`[AgentService] Retrying after transient error in ${delayMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`
						)
						await new Promise((resolve) => setTimeout(resolve, delayMs))
						continue
					}
					if (isQuotaExceededError(capturedError)) {
						const inner = toErrorWithMessage(capturedError).message
						throw new Error(
							`Daily free quota hit for ${modelName} - this resets tomorrow, not in a few seconds. Switch models (gear icon / model picker) or wait. (${inner})`
						)
					}
					throw toErrorWithMessage(capturedError)
				}

				// No API error, but the model still produced nothing usable. A stream
				// that dies after only a few characters (e.g. just `{"`) with no error
				// at all is the same kind of transient infra hiccup as the captured-error
				// case above - Google's API sometimes drops the connection mid-response
				// under load without ever calling onError - so it gets the same retry.
				if (nothingYieldedYet) {
					const trimmed = buffer.trim()
					const looksTruncated = trimmed.length > 0 && trimmed.length < 30
					if ((!trimmed || looksTruncated) && attempt < MAX_ATTEMPTS) {
						const delayMs = 500 * attempt
						console.warn(
							`[AgentService] Retrying after suspiciously short output (${trimmed.length} chars) in ${delayMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`
						)
						await new Promise((resolve) => setTimeout(resolve, delayMs))
						continue
					}
					if (!trimmed) {
						throw new Error('The model returned an empty response. Try again, or switch models.')
					}
					console.error('[AgentService] Unparseable model output:', buffer)
					throw new Error(
						"The model's response couldn't be understood (invalid format). Try again, or switch models."
					)
				}

				// Report token usage so the client can show a running cost meter.
				try {
					const u = await usage
					const meta = (await providerMetadata) as
						| { anthropic?: { cacheCreationInputTokens?: number } }
						| undefined
					// For Anthropic the AI SDK reports inputTokens as the *uncached* part only;
					// cache reads and cache writes are separate. Normalize so inputTokens is
					// always the full prompt size, which is what the meter expects.
					const cacheCreationInputTokens = meta?.anthropic?.cacheCreationInputTokens ?? 0
					const cachedInputTokens = u.cachedInputTokens ?? 0
					const isAnthropic = modelDefinition.provider === 'anthropic'
					const inputTokens = isAnthropic
						? (u.inputTokens ?? 0) + cachedInputTokens + cacheCreationInputTokens
						: (u.inputTokens ?? 0)
					yield {
						usage: {
							modelName,
							inputTokens,
							outputTokens: u.outputTokens ?? 0,
							cachedInputTokens,
							cacheCreationInputTokens,
							reasoningTokens: u.reasoningTokens ?? 0,
						},
					}
				} catch (e) {
					console.warn('Could not read usage', e)
				}

				break
			}
		} catch (error: any) {
			console.error('streamActions error:', error)
			throw error
		}
	}
}

/** Either a streamed action or the final usage report. */
export type AgentStreamEvent = Streaming<AgentAction> | { usage: AgentUsage }

/**
 * Normalize whatever onError/catch handed us into a real Error with a message
 * worth showing the user (the AI SDK's APICallError.message is usually already
 * the upstream provider's own error text, e.g. a Groq rate-limit explanation).
 */
function toErrorWithMessage(error: unknown): Error {
	if (error instanceof Error) return error
	if (typeof error === 'string') return new Error(error)
	return new Error('The model request failed. Try again, or switch models.')
}

const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504])

/**
 * A daily/quota cap (e.g. Gemini free tier's 20-requests-per-day limit on its
 * newest model) looks like a 429 too, but retrying it is pointless - it won't
 * reset in the few seconds a retry loop can afford. Only a transient 429 with
 * no quota language in it is worth retrying.
 */
function isQuotaExceededError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return /quota|RESOURCE_EXHAUSTED|exceeded your current/i.test(message)
}

/**
 * Whether an API error is worth silently retrying: transient rate limits and
 * server-side overload, not a hard daily quota, and not things like a bad
 * model id or a malformed request. The AI SDK's own `error.isRetryable` can't
 * be trusted here - @ai-sdk/google never sets it.
 */
function isRetryableApiError(error: unknown): boolean {
	if (isQuotaExceededError(error)) return false
	const statusCode = (error as { statusCode?: unknown } | undefined)?.statusCode
	if (typeof statusCode === 'number' && (statusCode === 429 || RETRYABLE_STATUS_CODES.has(statusCode)))
		return true
	const message = error instanceof Error ? error.message : String(error)
	return /high demand|unavailable|overloaded|try again later/i.test(message)
}

type StreamTextProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>

/**
 * Map a model definition's reasoning preferences to AI SDK provider options.
 * Only the matching provider's options are set; the SDK ignores the rest.
 */
function getProviderOptions(
	definition: AgentModelDefinition,
	lowEffort = false
): StreamTextProviderOptions {
	switch (definition.provider) {
		case 'anthropic': {
			const effort = lowEffort && definition.effort ? 'low' : definition.effort
			return {
				anthropic: {
					thinking:
						definition.thinking === 'adaptive' ? { type: 'adaptive' } : { type: 'disabled' },
					...(effort ? { effort } : {}),
				} satisfies AnthropicProviderOptions,
			}
		}
		case 'google':
			return {
				google: {
					thinkingConfig: { thinkingLevel: lowEffort ? 'low' : definition.thinkingLevel },
				} satisfies GoogleGenerativeAIProviderOptions,
			}
		case 'openai':
			return {
				openai: {
					reasoningEffort: lowEffort ? 'low' : definition.reasoningEffort,
				} satisfies OpenAIResponsesProviderOptions,
			}
		case 'groq':
			// Groq's current free models (gpt-oss, qwen3) are all reasoning models.
			// Keep reasoning effort low so chain-of-thought doesn't eat the whole
			// output budget before any visible JSON is produced.
			return {
				groq: {
					reasoningEffort: 'low',
				} satisfies GroqProviderOptions,
			}
	}
}
