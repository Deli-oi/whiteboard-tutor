import { ExecutionContext } from '@cloudflare/workers-types'
import { captureException, instrumentDurableObjectWithSentry, withSentry } from '@sentry/cloudflare'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { AutoRouter, cors, error, IRequest } from 'itty-router'
import { checkAccess } from './auth'
import { AgentDurableObject as RawAgentDurableObject } from './do/AgentDurableObject'
import { Environment } from './environment'
import { rateLimit } from './rateLimit'
import { fallbackLogs } from './routes/fallbackLogs'
import { fetchLink } from './routes/fetchLink'
import { generateFragment } from './routes/generateFragment'
import { stream } from './routes/stream'
import { transcribe, transcribeGroq } from './routes/transcribe'

// Optional: unset by default (this app runs at $0 without it, same as
// GROQ_API_KEY/OPENAI_API_KEY). An empty dsn disables the Sentry SDK
// entirely (no network calls), so there's no cost to leaving it unset.
const sentryOptions = (env: Environment) => ({ dsn: env.SENTRY_DSN ?? '', tracesSampleRate: 0 })

const { preflight, corsify } = cors({
	// The browser still has to pass checkAccess; this only sets the response headers.
	origin: (origin) => origin,
	allowHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
	allowMethods: ['GET', 'POST', 'OPTIONS'],
})

const router = AutoRouter<IRequest, [env: Environment, ctx: ExecutionContext]>({
	before: [preflight, (request, env) => checkAccess(request, env) ?? undefined, rateLimit],
	finally: [corsify],
	catch: (e) => {
		console.error(e)
		captureException(e)
		return error(e)
	},
})
	.post('/stream', stream)
	.post('/transcribe', transcribe)
	.post('/transcribe-groq', transcribeGroq)
	.post('/fetch', fetchLink)
	.post('/extension/generate', generateFragment)
	.get('/fallback-logs', fallbackLogs)
	.get('/fallback-logs/:id', fallbackLogs)

class WhiteboardTutorWorker extends WorkerEntrypoint<Environment> {
	override fetch(request: Request): Promise<Response> {
		return router.fetch(request, this.env, this.ctx)
	}
}

export default withSentry(sentryOptions, WhiteboardTutorWorker)

// Make the durable object available to the cloudflare worker
export const AgentDurableObject = instrumentDurableObjectWithSentry(sentryOptions, RawAgentDurableObject)
