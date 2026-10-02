import { captureException, flush } from '@sentry/cloudflare'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, IRequest } from 'itty-router'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { AgentPromptSchema } from '../../shared/types/AgentPromptSchema'
import { Environment } from '../environment'
import { AgentService, AgentStreamEvent } from './AgentService'

export class AgentDurableObject extends DurableObject<Environment> {
	service: AgentService

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		this.service = new AgentService(this.env) // swap this with your own service

		// Every createHtml call is the fallback path (CLAUDE.md: "if no tool
		// fits, a bigger model writes raw HTML directly - log every fallback")
		// - the model writes raw HTML precisely when none of the 5 template
		// tools fit the request. Logging these is what the future
		// promote-to-tool builder loop will read from to find candidates to
		// generalize into new templates.
		ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS fallback_log (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				created_at TEXT NOT NULL,
				intent TEXT,
				html TEXT NOT NULL,
				html_length INTEGER NOT NULL
			)
		`)
	}

	private readonly router = AutoRouter({
		catch: (e) => {
			console.error(e)
			captureException(e)
			return error(e)
		},
	})
		.post('/stream', (request) => this.stream(request))
		.get('/fallback-logs', () => this.getFallbackLogs())
		.get('/fallback-logs/:id', (request) => this.getFallbackLog(request))
		.post('/check-rate-limit', () => this.checkRateLimit())

	// `fetch` is the entry point for all requests to the Durable Object
	override fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	/**
	 * Stream changes from the model.
	 *
	 * @param request - The request object containing the prompt.
	 * @returns A Promise that resolves to a Response object containing the streamed changes.
	 */
	private async stream(request: Request): Promise<Response> {
		let body: unknown
		try {
			body = await request.json()
		} catch {
			return new Response('Request body must be valid JSON', { status: 400 })
		}
		const parsed = AgentPromptSchema.safeParse(body)
		if (!parsed.success) {
			return new Response(`Malformed prompt: ${parsed.error.message}`, { status: 400 })
		}
		const prompt = parsed.data as unknown as AgentPrompt

		const encoder = new TextEncoder()
		const { readable, writable } = new TransformStream()
		const writer = writable.getWriter()

		const response: { changes: AgentStreamEvent[] } = { changes: [] }

		;(async () => {
			try {
				for await (const change of this.service.stream(prompt)) {
					response.changes.push(change)
					this.logIfFallback(change)
					const data = `data: ${JSON.stringify(change)}\n\n`
					await writer.write(encoder.encode(data))
					await writer.ready
				}
				await writer.close()
			} catch (error: any) {
				console.error('Stream error:', error)
				captureException(error)
				// This runs detached from the request that triggered it (the
				// Response was already returned above) - instrumentDurableObjectWithSentry's
				// own flush-on-return has likely already fired by now, so flush
				// explicitly or the event may never leave the isolate.
				this.ctx.waitUntil(flush(2000))

				// Send error through the stream
				const errorData = `data: ${JSON.stringify({ error: error.message })}\n\n`
				try {
					await writer.write(encoder.encode(errorData))
					await writer.close()
				} catch (writeError) {
					await writer.abort(writeError)
				}
			}
		})()

		return new Response(readable, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
				'Transfer-Encoding': 'chunked',
			},
		})
	}

	private logIfFallback(change: AgentStreamEvent) {
		if (!('_type' in change) || change._type !== 'createHtml' || !change.complete) return
		this.ctx.storage.sql.exec(
			'INSERT INTO fallback_log (created_at, intent, html, html_length) VALUES (?, ?, ?, ?)',
			new Date().toISOString(),
			change.intent ?? null,
			change.html,
			change.html.length
		)
	}

	/**
	 * Recent createHtml fallback calls, newest first - what a future
	 * promote-to-tool builder would read to find generalization candidates.
	 */
	private getFallbackLogs(): Response {
		const rows = [
			...this.ctx.storage.sql.exec(
				'SELECT id, created_at, intent, html_length FROM fallback_log ORDER BY id DESC LIMIT 100'
			),
		]
		return new Response(JSON.stringify(rows), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	/** The full logged HTML for one fallback call, for builder review. */
	private getFallbackLog(request: IRequest): Response {
		const id = Number(request.params.id)
		const rows = [
			...this.ctx.storage.sql.exec('SELECT * FROM fallback_log WHERE id = ?', id),
		]
		if (rows.length === 0) return new Response('Not found', { status: 404 })
		return new Response(JSON.stringify(rows[0]), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	/**
	 * Fixed-window rate limit (60s windows, 20 requests/window). This class is
	 * reused for this purpose rather than adding a dedicated DO binding: the
	 * worker derives this instance's id from the caller's IP
	 * (`idFromName('ratelimit:' + ip)`), a completely separate instance from
	 * that same IP's actual per-session conversation DO. Defense in depth
	 * beyond ACCESS_TOKEN, which is optional and does nothing if left unset.
	 */
	private checkRateLimit(): Response {
		const WINDOW_MS = 60_000
		const MAX_PER_WINDOW = 20

		this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS rate_limit (
				window_start INTEGER NOT NULL,
				count INTEGER NOT NULL
			)
		`)

		const now = Date.now()
		const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS

		const rows = [...this.ctx.storage.sql.exec('SELECT window_start, count FROM rate_limit LIMIT 1')] as {
			window_start: number
			count: number
		}[]

		let count: number
		if (rows.length === 0) {
			count = 1
			this.ctx.storage.sql.exec(
				'INSERT INTO rate_limit (window_start, count) VALUES (?, ?)',
				windowStart,
				count
			)
		} else if (rows[0].window_start !== windowStart) {
			count = 1
			this.ctx.storage.sql.exec(
				'UPDATE rate_limit SET window_start = ?, count = ?',
				windowStart,
				count
			)
		} else {
			count = rows[0].count + 1
			this.ctx.storage.sql.exec('UPDATE rate_limit SET count = ?', count)
		}

		return Response.json({ allowed: count <= MAX_PER_WINDOW, count, limit: MAX_PER_WINDOW })
	}
}
