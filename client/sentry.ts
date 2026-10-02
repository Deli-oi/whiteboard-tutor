import * as Sentry from '@sentry/browser'

let initialized = false

/**
 * Optional, same as the worker side (worker/worker.ts) - unset by default,
 * no bundle cost beyond the SDK itself. Set VITE_SENTRY_DSN in a local .env
 * file (not .dev.vars - that's wrangler-only and never reaches the browser).
 */
export function initSentry(): void {
	const dsn = import.meta.env.VITE_SENTRY_DSN
	if (!dsn) return
	Sentry.init({ dsn, tracesSampleRate: 0 })
	initialized = true
}

/** Report an error that was already caught and handled (e.g. shown as a toast). */
export function reportError(error: unknown): void {
	if (!initialized) return
	Sentry.captureException(error)
}
