/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Optional. See client/sentry.ts and .env.example. */
	readonly VITE_SENTRY_DSN?: string
}
