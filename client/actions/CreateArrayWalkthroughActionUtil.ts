import { CreateArrayWalkthroughAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { computeBinarySearchSteps } from '../tools/algorithms/binarySearch'
import { ArrayStep } from '../tools/algorithms/arrayTypes'
import { computeTwoSumSteps } from '../tools/algorithms/twoSum'
import { renderArrayWalkthrough } from '../tools/arrayWalkthroughTemplate'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { sanitizeHtmlShapeAction, upsertHtmlShape } from './htmlShapeHelpers'

export const CreateArrayWalkthroughActionUtil = registerActionUtil(
	class CreateArrayWalkthroughActionUtil extends AgentActionUtil<CreateArrayWalkthroughAction> {
		static override type = 'createArrayWalkthrough' as const

		override getInfo(action: Streaming<CreateArrayWalkthroughAction>) {
			return { icon: 'note' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(
			action: Streaming<CreateArrayWalkthroughAction>,
			helpers: AgentHelpers
		) {
			sanitizeHtmlShapeAction(this.editor, action, helpers, { w: 450, h: 260 })
			return action
		}

		override applyAction(action: Streaming<CreateArrayWalkthroughAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			if (!action.shapeId || !action.array || action.array.length === 0) return

			const steps = resolveSteps(action)
			if (!steps || steps.length === 0) return

			const { x, y, w, h } = helpers.removeOffsetFromBox({
				x: action.x,
				y: action.y,
				w: action.w,
				h: action.h,
			})

			const html = renderArrayWalkthrough(action, steps, w, h)
			upsertHtmlShape(this.editor, { shapeId: action.shapeId, x, y, w, h, html })
		}
	}
)

function resolveSteps(action: CreateArrayWalkthroughAction): ArrayStep[] | null {
	if (action.algorithm && action.target !== undefined) {
		switch (action.algorithm) {
			case 'two-sum':
				return computeTwoSumSteps(action.array, action.target)
			case 'binary-search':
				return computeBinarySearchSteps(action.array, action.target)
		}
	}
	if (!action.steps) return null
	return action.steps.map((step) => ({
		description: step.description,
		pointers: step.pointers ?? [],
	}))
}
