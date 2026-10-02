import { CreateConceptMapAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { renderConceptMap } from '../tools/conceptMapTemplate'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { sanitizeHtmlShapeAction, upsertHtmlShape } from './htmlShapeHelpers'

export const CreateConceptMapActionUtil = registerActionUtil(
	class CreateConceptMapActionUtil extends AgentActionUtil<CreateConceptMapAction> {
		static override type = 'createConceptMap' as const

		override getInfo(action: Streaming<CreateConceptMapAction>) {
			return { icon: 'note' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(action: Streaming<CreateConceptMapAction>, helpers: AgentHelpers) {
			sanitizeHtmlShapeAction(this.editor, action, helpers, { w: 500, h: 350 })
			return action
		}

		override applyAction(action: Streaming<CreateConceptMapAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			if (!action.shapeId || !action.nodes || action.nodes.length === 0) return

			const { x, y, w, h } = helpers.removeOffsetFromBox({
				x: action.x,
				y: action.y,
				w: action.w,
				h: action.h,
			})

			const html = renderConceptMap(action, w, h)
			upsertHtmlShape(this.editor, { shapeId: action.shapeId, x, y, w, h, html })
		}
	}
)
