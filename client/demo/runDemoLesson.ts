import type { TldrawAgent } from '../agent/TldrawAgent'

/**
 * Replays a scripted "load balancer" lesson through the real action pipeline.
 *
 * Open the app with `?demo` to see the experience without any API key. The
 * actions are the same kinds a model emits: `message` (chat text) and `create`
 * (drawn). Only the source is different: a script instead of a model.
 */
export async function runDemoLesson(agent: TldrawAgent) {
	const { editor } = agent
	const params = new URLSearchParams(window.location.search)
	const delay = Number(params.get('delay') ?? 700)

	// Fresh board
	agent.reset()
	editor.selectAll()
	editor.deleteShapes(editor.getSelectedShapeIds())

	const vp = editor.getViewportPageBounds()
	const ox = Math.round(vp.x + 60)
	const oy = Math.round(vp.y + 140)

	const geo = (
		id: string,
		x: number,
		y: number,
		w: number,
		h: number,
		text: string,
		color: string,
		type = 'rectangle'
	) => ({
		_type: 'create',
		intent: 'draw ' + id,
		shape: { _type: type, shapeId: id, x: ox + x, y: oy + y, w, h, text, color, fill: 'tint', note: '' },
	})
	const arrow = (
		id: string,
		from: string,
		to: string,
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		text = ''
	) => ({
		_type: 'create',
		intent: 'connect',
		shape: {
			_type: 'arrow',
			shapeId: id,
			fromId: from,
			toId: to,
			x1: ox + x1,
			y1: oy + y1,
			x2: ox + x2,
			y2: oy + y2,
			color: 'black',
			note: '',
			text,
		},
	})
	const txt = (id: string, x: number, y: number, text: string, color: string, fontSize = 18) => ({
		_type: 'create',
		intent: 'note',
		shape: {
			_type: 'text',
			shapeId: id,
			x: ox + x,
			y: oy + y,
			text,
			color,
			anchor: 'top-left',
			maxWidth: null,
			note: '',
			fontSize,
		},
	})
	const msg = (text: string) => ({ _type: 'message', text })

	const question = 'Explain how a load balancer works'
	agent.chat.push({
		type: 'prompt',
		promptSource: 'user',
		agentFacingMessage: question,
		userFacingMessage: question,
		contextItems: [],
		selectedShapes: [],
	})

	const steps = [
		msg("Let's start with the problem. One server can't handle every request, so we put a load balancer in front."),
		txt('title', 0, -80, 'Load balancer: one entrance, many servers', 'black', 26),
		geo('client', 0, 40, 170, 80, 'Clients\nmany requests', 'blue'),
		geo('lb', 320, 40, 220, 80, 'Load balancer\none public address', 'violet'),
		arrow('a1', 'client', 'lb', 170, 80, 320, 80),
		msg('The load balancer sends each request to one of several servers behind it. The client never talks to a server directly.'),
		geo('s1', 760, -60, 190, 60, 'Server 1', 'green'),
		geo('s2', 760, 50, 190, 60, 'Server 2', 'green'),
		geo('s3', 760, 160, 190, 60, 'Server 3', 'green'),
		arrow('a2', 'lb', 's1', 540, 80, 760, -30),
		arrow('a3', 'lb', 's2', 540, 80, 760, 80),
		arrow('a4', 'lb', 's3', 540, 80, 760, 190),
		txt('rule', 320, 150, 'Each request goes to ONE server, not all three', 'violet', 16),
		msg("It also checks the servers' health. If one goes down, it stops sending traffic there and the others pick up the slack."),
		geo('hc', 760, 290, 190, 70, 'Health check\nevery few seconds', 'orange', 'ellipse'),
		arrow('a5', 'hc', 's3', 855, 290, 855, 220),
		txt('sum', 0, 330, '1. Spread the work    2. Survive a dead server    3. Add servers without changing the client', 'grey', 16),
		msg('So: spread the work, survive a dead server, and scale by adding machines. Want me to show what happens when Server 2 dies?'),
	]

	for (const step of steps) {
		agent.actions.act({ ...step, complete: true, time: 120 } as any)
		editor.selectNone()
		await new Promise((r) => setTimeout(r, delay))
	}
}
