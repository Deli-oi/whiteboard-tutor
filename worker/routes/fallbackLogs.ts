import { IRequest } from 'itty-router'
import { getSessionId } from '../auth'
import { Environment } from '../environment'

export async function fallbackLogs(request: IRequest, env: Environment) {
	const id = env.AGENT_DURABLE_OBJECT.idFromName(getSessionId(request))
	const DO = env.AGENT_DURABLE_OBJECT.get(id)
	const response = await DO.fetch(request.url, { method: 'GET' })

	return new Response(response.body as BodyInit, {
		headers: { 'Content-Type': 'application/json' },
	})
}
