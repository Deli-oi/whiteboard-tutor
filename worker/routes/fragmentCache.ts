/**
 * Backing store for worker/routes/renderFragment.ts - see that file for why
 * generated visualizations need to be served from a real URL instead of
 * inlined via srcdoc.
 *
 * A plain in-memory Map, scoped to one Worker isolate. This is a deliberate
 * dev-mode simplification, not an oversight: `npm run dev` runs a single
 * isolate for the whole session, so generate-then-immediately-render always
 * hits the same Map. A real multi-isolate production deployment would need
 * this to live in a Durable Object or KV instead, since a later request can
 * land on a different isolate with an empty Map - worth fixing before this
 * app is deployed for real, not before then.
 */

interface CachedFragment {
	html: string
	expiresAt: number
}

const TTL_MS = 5 * 60 * 1000 // generous - this only needs to outlive "generate, then immediately display"
const cache = new Map<string, CachedFragment>()

function pruneExpired() {
	const now = Date.now()
	for (const [id, entry] of cache) {
		if (entry.expiresAt < now) cache.delete(id)
	}
}

/** Stores `html`, returning an unguessable id to retrieve it with. */
export function storeFragment(html: string): string {
	pruneExpired()
	const id = crypto.randomUUID()
	cache.set(id, { html, expiresAt: Date.now() + TTL_MS })
	return id
}

/** Returns the stored html for `id`, or null if it was never stored, already expired, or already consumed. */
export function getFragment(id: string): string | null {
	pruneExpired()
	return cache.get(id)?.html ?? null
}
