import { CreateAlgorithmWalkthroughAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { computeBfsSteps } from '../tools/algorithms/bfs'
import { computeDfsSteps } from '../tools/algorithms/dfs'
import { computeDijkstraSteps } from '../tools/algorithms/dijkstra'
import { AlgorithmStep } from '../tools/algorithms/types'
import { renderAlgorithmWalkthrough } from '../tools/algorithmWalkthroughTemplate'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { sanitizeHtmlShapeAction, upsertHtmlShape } from './htmlShapeHelpers'

export const CreateAlgorithmWalkthroughActionUtil = registerActionUtil(
	class CreateAlgorithmWalkthroughActionUtil extends AgentActionUtil<CreateAlgorithmWalkthroughAction> {
		static override type = 'createAlgorithmWalkthrough' as const

		override getInfo(action: Streaming<CreateAlgorithmWalkthroughAction>) {
			return { icon: 'note' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(
			action: Streaming<CreateAlgorithmWalkthroughAction>,
			helpers: AgentHelpers
		) {
			sanitizeHtmlShapeAction(this.editor, action, helpers, { w: 450, h: 500 })
			return action
		}

		override applyAction(
			action: Streaming<CreateAlgorithmWalkthroughAction>,
			helpers: AgentHelpers
		) {
			if (!action.complete) return
			if (!action.shapeId || !action.nodes) return

			const steps = resolveSteps(action)
			if (!steps || steps.length === 0) return

			const { x, y, w, h } = helpers.removeOffsetFromBox({
				x: action.x,
				y: action.y,
				w: action.w,
				h: action.h,
			})

			const html = renderAlgorithmWalkthrough(action, steps, w, h)
			upsertHtmlShape(this.editor, { shapeId: action.shapeId, x, y, w, h, html })
		}
	}
)

/**
 * For a known algorithm, compute the trace deterministically instead of
 * trusting the model's hand-written `steps` - see dijkstra.ts for why
 * (manually simulating even a small graph reliably goes wrong: wrong visit
 * order, a missed node, a wrong distance).
 */
function resolveSteps(action: CreateAlgorithmWalkthroughAction): AlgorithmStep[] | null {
	if (action.algorithm && action.startNodeId) {
		switch (action.algorithm) {
			case 'dijkstra':
				return computeDijkstraSteps(action.nodes, action.edges, action.startNodeId)
			case 'bfs':
				return computeBfsSteps(action.nodes, action.edges, action.startNodeId)
			case 'dfs':
				return computeDfsSteps(action.nodes, action.edges, action.startNodeId)
		}
	}
	if (!action.steps) return null
	return action.steps.map((step) => ({
		description: step.description,
		activeNodeIds: step.activeNodeIds ?? [],
		visitedNodeIds: step.visitedNodeIds ?? [],
		activeEdges: step.activeEdges ?? [],
	}))
}
