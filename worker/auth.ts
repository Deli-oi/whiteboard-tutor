import { IRequest } from 'itty-router'
import { Environment } from './environment'

/**
 * Cheap protection for the three routes that spend money.
 *
 * - If `ACCESS_TOKEN` is set, requests must carry `Authorization: Bearer <token>`.
 * - If `ALLOWED_ORIGINS` is set, the request's Origin must be in that list.
 *   Otherwise browsers may only call from the worker's own origin, except in
 *   local dev (localhost) where anything goes.
 *
 * Returns a Response to send back if the request is rejected, or null if OK.
 */
export function checkAccess(request: IRequest, env: Environment): Response | null {
	const url = new URL(request.url)
	const isLocalDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

	const origin = request.headers.get('Origin')
	if (origin && !isLocalDev) {
		let ok = false
		if (env.ALLOWED_ORIGINS) {
			const allowed = env.ALLOWED_ORIGINS.split(',')
				.map((o) => o.trim())
				.filter(Boolean)
			ok = allowed.includes(origin)
		} else {
			// Same host as the worker itself (scheme-insensitive: proxies may rewrite it).
			try {
				ok = new URL(origin).host === url.host
			} catch {
				ok = false
			}
		}
		if (!ok) return new Response('Origin not allowed', { status: 403 })
	}

	// /extension/render/:id is loaded via a plain <iframe src> navigation (on
	// purpose - that's what gives it its own origin, independent of whatever
	// CSP the embedding page sets, which a srcdoc/data: iframe can't escape).
	// A browser navigation can't attach a custom Authorization header the way
	// fetch/XHR can, so the bearer-token gate below is structurally
	// impossible to satisfy for it. It relies on its own protection instead:
	// the id is an unguessable crypto.randomUUID() serving content that
	// expires within minutes (see worker/routes/fragmentCache.ts) - the same
	// security posture as an unlisted link, appropriate since this route
	// only ever re-serves a visualization this same instance just generated,
	// never anything sensitive or billable on its own.
	if (env.ACCESS_TOKEN && !url.pathname.startsWith('/extension/render/')) {
		const header = request.headers.get('Authorization') ?? ''
		const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
		if (!token || !timingSafeEqual(token, env.ACCESS_TOKEN)) {
			return new Response('Access token required. Add it in the voice settings drawer.', {
				status: 401,
			})
		}
	}

	return null
}

function timingSafeEqual(a: string, b: string) {
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
	return diff === 0
}

/** Stable id for the caller's session, used to give each browser tab its own Durable Object. */
export function getSessionId(request: IRequest): string {
	const id = request.headers.get('x-session-id') ?? ''
	// Only accept a simple token so it can't be abused as a path or key.
	return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : 'anonymous'
}
