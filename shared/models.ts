export type AgentModelName = keyof typeof AGENT_MODEL_DEFINITIONS
export type AgentModelProvider = 'openai' | 'anthropic' | 'google' | 'groq'

/** Adaptive-thinking mode passed to the Anthropic provider. */
export type AnthropicThinking = 'adaptive' | 'disabled'

/** Effort level passed to the Anthropic provider (Opus 4.6+/Sonnet 4.6+; not supported on Haiku 4.5). */
export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Reasoning effort passed to the OpenAI provider. */
export type OpenAIReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Thinking level passed to the Google provider. */
export type GeminiThinkingLevel = 'low' | 'medium' | 'high'

/** USD per million tokens. Used only for the on-screen cost estimate. */
export interface ModelPricing {
	inputPerMTok: number
	cachedInputPerMTok: number
	outputPerMTok: number
}

interface BaseAgentModelDefinition {
	name: AgentModelName
	id: string

	/**
	 * Optional list price, used for the running cost meter in the UI.
	 * Leave it out if you don't know it; the meter then shows tokens only.
	 */
	pricing?: ModelPricing

	/**
	 * Whether the model accepts a prefilled assistant turn to force the JSON start.
	 * Opus 4.6+ and Sonnet 4.6+ reject last-assistant-turn prefills (400).
	 */
	supportsPrefill: boolean

	/**
	 * Whether the model accepts a `temperature` sampling parameter.
	 * Opus 4.7+ and Sonnet 5 removed `temperature`/`top_p`/`top_k` (sending them is a 400).
	 */
	supportsTemperature: boolean
}

export interface AnthropicModelDefinition extends BaseAgentModelDefinition {
	provider: 'anthropic'
	thinking: AnthropicThinking
	/** Effort level; omit for models that don't support it (e.g. Haiku 4.5). */
	effort?: AnthropicEffort
}

export interface GoogleModelDefinition extends BaseAgentModelDefinition {
	provider: 'google'
	thinkingLevel: GeminiThinkingLevel
}

export interface OpenAIModelDefinition extends BaseAgentModelDefinition {
	provider: 'openai'
	reasoningEffort: OpenAIReasoningEffort
}

/** Groq's hosted open-weight models, served through an OpenAI-compatible API. Free tier. */
export interface GroqModelDefinition extends BaseAgentModelDefinition {
	provider: 'groq'
}

export type AgentModelDefinition =
	| AnthropicModelDefinition
	| GoogleModelDefinition
	| OpenAIModelDefinition
	| GroqModelDefinition

export const AGENT_MODEL_DEFINITIONS = {
	// Anthropic models
	'claude-opus-5': {
		name: 'claude-opus-5',
		id: 'claude-opus-5',
		provider: 'anthropic',
		pricing: { inputPerMTok: 5, cachedInputPerMTok: 0.5, outputPerMTok: 25 },
		supportsPrefill: false,
		supportsTemperature: false,
		thinking: 'adaptive',
		effort: 'medium',
	},

	'claude-sonnet-5': {
		name: 'claude-sonnet-5',
		id: 'claude-sonnet-5',
		provider: 'anthropic',
		pricing: { inputPerMTok: 2, cachedInputPerMTok: 0.2, outputPerMTok: 10 },
		supportsPrefill: false,
		supportsTemperature: false,
		thinking: 'adaptive',
		effort: 'low',
	},

	'claude-haiku-4-5': {
		name: 'claude-haiku-4-5',
		id: 'claude-haiku-4-5',
		provider: 'anthropic',
		pricing: { inputPerMTok: 1, cachedInputPerMTok: 0.1, outputPerMTok: 5 },
		supportsPrefill: true,
		supportsTemperature: true,
		thinking: 'disabled',
	},

	// Google models
	'gemini-3.8-flash': {
		name: 'gemini-3.8-flash',
		id: 'gemini-3.8-flash',
		provider: 'google',
		supportsPrefill: false,
		supportsTemperature: false,
		thinkingLevel: 'low',
	},

	// Google's free tier is per-model, per-day (resets midnight Pacific), and
	// gemini-3.8-flash (the newest/most in-demand) gets a tiny free quota - 20
	// requests/day, confirmed via a live quota-exceeded error. flash-lite is a
	// separate quota pool and typically gets a more generous free allowance, so
	// it's the default. Switch back to gemini-3.8-flash for tougher requests
	// once its quota resets, or if flash-lite's quality isn't enough.
	'gemini-3.1-flash-lite': {
		name: 'gemini-3.1-flash-lite',
		id: 'gemini-3.1-flash-lite',
		provider: 'google',
		supportsPrefill: false,
		supportsTemperature: false,
		thinkingLevel: 'low',
	},

	// OpenAI models
	'gpt-5.6-sol': {
		name: 'gpt-5.6-sol',
		id: 'gpt-5.6-sol',
		provider: 'openai',
		supportsPrefill: false,
		supportsTemperature: false,
		reasoningEffort: 'medium',
	},

	'gpt-5.6-terra': {
		name: 'gpt-5.6-terra',
		id: 'gpt-5.6-terra',
		provider: 'openai',
		supportsPrefill: false,
		supportsTemperature: false,
		reasoningEffort: 'high',
	},

	'gpt-5.6-luna': {
		name: 'gpt-5.6-luna',
		id: 'gpt-5.6-luna',
		provider: 'openai',
		supportsPrefill: false,
		supportsTemperature: false,
		reasoningEffort: 'max',
	},

	// Groq models (free tier, OpenAI-compatible)
	'openai/gpt-oss-120b': {
		name: 'openai/gpt-oss-120b',
		id: 'openai/gpt-oss-120b',
		provider: 'groq',
		// No pricing entry: intended to run within Groq's free tier, so the
		// on-screen cost meter shows tokens only rather than a possibly-wrong $ estimate.
		supportsPrefill: false,
		supportsTemperature: true,
	},
} as const

// Groq's free tier caps every model at 8,000 tokens/minute, and this agent's
// system prompt + schema alone runs ~11.5k tokens even in tutor mode — a hard
// structural mismatch, not something model choice or reasoning effort can fix.
// Google's Gemini free tier has no such ceiling for a prompt this size, and the
// google provider is already fully wired below, so it's the default for $0 use.
// Within Google: gemini-3.1-flash-lite, not gemini-3.8-flash, since the newest
// flagship model's free tier is a tiny 20-requests/day quota (see above) while
// the lite model is a separate, less-contended pool.
export const DEFAULT_MODEL_NAME: AgentModelName = 'gemini-3.1-flash-lite'

/**
 * Check if a string is a valid AgentModelName.
 */
export function isValidModelName(value: string | undefined): value is AgentModelName {
	return !!value && value in AGENT_MODEL_DEFINITIONS
}

/**
 * Get the full information about a model from its name.
 * @param modelName - The name of the model.
 * @returns The full definition of the model.
 */
export function getAgentModelDefinition(modelName: AgentModelName): AgentModelDefinition {
	const definition = AGENT_MODEL_DEFINITIONS[modelName]
	if (!definition) {
		throw new Error(`Model ${modelName} not found`)
	}
	return definition
}

/**
 * Get the list pricing for a model, if known.
 */
export function getModelPricing(modelName: AgentModelName): ModelPricing | null {
	const definition: AgentModelDefinition = AGENT_MODEL_DEFINITIONS[modelName]
	return definition.pricing ?? null
}
