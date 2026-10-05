/**
 * Pure, dependency-free model-error classification. Lives under shared/ (not
 * worker/do/) specifically so the extension's background script can import
 * it too, without dragging in anything Workers-specific - these three
 * functions only ever look at an Error's message/statusCode.
 */

/**
 * Normalize whatever onError/catch handed us into a real Error with a message
 * worth showing the user (the AI SDK's APICallError.message is usually already
 * the upstream provider's own error text, e.g. a Groq rate-limit explanation).
 */
export function toErrorWithMessage(error: unknown): Error {
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
export function isQuotaExceededError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return /quota|RESOURCE_EXHAUSTED|exceeded your current/i.test(message)
}

/**
 * Whether an API error is worth silently retrying: transient rate limits and
 * server-side overload, not a hard daily quota, and not things like a bad
 * model id or a malformed request. The AI SDK's own `error.isRetryable` can't
 * be trusted here - @ai-sdk/google never sets it.
 */
export function isRetryableApiError(error: unknown): boolean {
	if (isQuotaExceededError(error)) return false
	const statusCode = (error as { statusCode?: unknown } | undefined)?.statusCode
	if (typeof statusCode === 'number' && (statusCode === 429 || RETRYABLE_STATUS_CODES.has(statusCode)))
		return true
	const message = error instanceof Error ? error.message : String(error)
	return /high demand|unavailable|overloaded|try again later/i.test(message)
}
