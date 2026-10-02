export interface Environment {
	AGENT_DURABLE_OBJECT: DurableObjectNamespace
	OPENAI_API_KEY: string
	ANTHROPIC_API_KEY: string
	GOOGLE_API_KEY: string

	/**
	 * Optional. Powers the Groq Whisper-large-v3-turbo transcription engine
	 * (free tier, sub-second, works in any browser). Get one at console.groq.com.
	 */
	GROQ_API_KEY?: string

	/**
	 * Optional. When set, every API route requires `Authorization: Bearer <token>`.
	 * Set it before deploying publicly, otherwise anyone can spend your credits.
	 * Users paste the same token into the settings drawer once.
	 */
	ACCESS_TOKEN?: string

	/**
	 * Optional. Comma-separated list of origins allowed to call the API
	 * (e.g. "https://tutor.example.com"). Defaults to same-origin only when
	 * deployed, and to any origin in local dev.
	 */
	ALLOWED_ORIGINS?: string

	/**
	 * Optional. A GitHub token raises the rate limit for reading pull requests
	 * and issues (60/hour without one) and allows private repos you can see.
	 */
	GITHUB_TOKEN?: string
}
