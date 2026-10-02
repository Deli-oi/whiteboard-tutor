import { IRequest } from 'itty-router'
import { Environment } from './environment'

/**
 * Defense in depth beyond ACCESS_TOKEN, which is optional and does nothing
 * if left unset: without this, a public deploy with no token configured has
 * zero request throttling standing between the internet and this worker's
 * paid Anthropic/OpenAI/Groq keys. Keyed by client IP (not session id, which
 * is attacker-controlled and trivially randomized per request) via a
 * dedicated Durable Object instance per IP - see
 * AgentDurableObject.checkRateLimit for the actual counter.
 *
 * Skipped in local dev, same as checkAccess, so it never gets in the way
 * while developing.
 */
export async function rateLimit(request: IRequest, env: Environment): Promise<Response | void> {
	const url = new URL(request.url)
	const isLocalDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
	if (isLocalDev) return undefined

	const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
	const id = env.AGENT_DURABLE_OBJECT.idFromName(`ratelimit:${ip}`)
	const stub = env.AGENT_DURABLE_OBJECT.get(id)

	let allowed = true
	try {
		const res = await stub.fetch('https://do/check-rate-limit', { method: 'POST' })
		const body = (await res.json()) as { allowed: boolean }
		allowed = body.allowed
	} catch (e) {
		// If the rate limiter itself fails, fail open - a broken limiter
		// shouldn't take the whole app down.
		console.error('[rateLimit] check failed, allowing request:', e)
		return undefined
	}

	if (!allowed) {
		return new Response('Too many requests, slow down', { status: 429 })
	}
	return undefined
}
