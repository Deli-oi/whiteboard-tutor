import { CreateFlowchartAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { renderFlowchart } from '../tools/flowchartTemplate'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { sanitizeHtmlShapeAction, upsertHtmlShape } from './htmlShapeHelpers'

export const CreateFlowchartActionUtil = registerActionUtil(
	class CreateFlowchartActionUtil extends AgentActionUtil<CreateFlowchartAction> {
		static override type = 'createFlowchart' as const

		override getInfo(action: Streaming<CreateFlowchartAction>) {
			return { icon: 'note' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(action: Streaming<CreateFlowchartAction>, helpers: AgentHelpers) {
			sanitizeHtmlShapeAction(this.editor, action, helpers, { w: 400, h: 450 })
			return action
		}

		override applyAction(action: Streaming<CreateFlowchartAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			if (!action.shapeId || !action.nodes || action.nodes.length === 0) return

			const { x, y, w, h } = helpers.removeOffsetFromBox({
				x: action.x,
				y: action.y,
				w: action.w,
				h: action.h,
			})

			const html = renderFlowchart(action, w, h)
			upsertHtmlShape(this.editor, { shapeId: action.shapeId, x, y, w, h, html })
		}
	}
)
