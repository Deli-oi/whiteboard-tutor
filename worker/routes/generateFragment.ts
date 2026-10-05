import { generateText } from 'ai'
import { IRequest } from 'itty-router'
import { z } from 'zod'
import { getAgentModelDefinition, DEFAULT_MODEL_NAME } from '../../shared/models'
import { getActionSchema } from '../../shared/types/AgentAction'
import { Environment } from '../environment'
import {
	AgentService,
	getProviderOptions,
	isQuotaExceededError,
	isRetryableApiError,
	toErrorWithMessage,
} from '../do/AgentService'
import { closeAndParseJson } from '../do/closeAndParseJson'
import { normalizeModelText } from '../do/normalizeModelText'
import { buildExtensionSystemPrompt } from '../prompt/buildExtensionPrompt'
import { inlineVendorAssets } from './inlineVendorAssets'

const GenerateFragmentRequestSchema = z.object({
	transcript: z.string().min(1),
	selection: z.object({
		tag: z.string(),
		id: z.string().optional(),
		classes: z.array(z.string()).optional(),
		preview: z.string().optional(),
	}),
})

const MAX_ATTEMPTS = 3

/**
 * Phase 4 of the extension pivot: one-shot, non-streaming generation. No
 * Durable Object - there's no per-session conversation to persist, this is a
 * single request in, one action out. Scoped to createHtml only for now
 * (the fallback tool, whose own guidance already covers charts/diagrams/
 * math/step-throughs generically) - wiring up the other 6 dedicated
 * render-template tools is a straightforward fast-follow, not a hard
 * problem, deliberately deferred to keep this checkpoint small.
 */
export async function generateFragment(request: IRequest, env: Environment) {
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return new Response('Request body must be valid JSON', { status: 400 })
	}
	const parsed = GenerateFragmentRequestSchema.safeParse(body)
	if (!parsed.success) {
		return new Response(`Malformed request: ${parsed.error.message}`, { status: 400 })
	}
	const { transcript, selection } = parsed.data

	const service = new AgentService(env)
	const modelDefinition = getAgentModelDefinition(DEFAULT_MODEL_NAME)
	const model = service.getModel(DEFAULT_MODEL_NAME)

	const systemPrompt = buildExtensionSystemPrompt()
	const userMessage = [
		`Circled element: <${selection.tag}${selection.id ? ` id="${selection.id}"` : ''}${
			selection.classes?.length ? ` class="${selection.classes.join(' ')}"` : ''
		}>`,
		selection.preview ? `Its content: "${selection.preview}"` : null,
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
				...(modelDefinition.supportsTemperature ? { temperature: 0 } : {}),
				providerOptions: getProviderOptions(modelDefinition, true),
			})

			const partialObject = closeAndParseJson(normalizeModelText(result.text))
			const actions = partialObject?.actions
			if (!Array.isArray(actions) || actions.length === 0) {
				console.error('[generateFragment] No actions in model output:', result.text)
				return new Response("The model's response couldn't be understood. Try again.", {
					status: 502,
				})
			}

			const action = actions[0]
			const schema = getActionSchema(action?._type)
			const validated = schema?.safeParse(action)
			if (!validated?.success) {
				console.error('[generateFragment] Model produced an invalid action:', action, validated?.error)
				return new Response("The model's response didn't match the expected shape. Try again.", {
					status: 502,
				})
			}

			const data = validated.data
			if (data._type === 'createHtml') {
				data.html = await inlineVendorAssets(data.html, new URL(request.url).origin)
			}

			return Response.json({ action: data })
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

	const err = toErrorWithMessage(lastError)
	console.error('[generateFragment] Generation failed:', err)
	return new Response(err.message, { status: 502 })
}
