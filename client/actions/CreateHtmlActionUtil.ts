import { CreateHtmlAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { sanitizeHtmlShapeAction, upsertHtmlShape } from './htmlShapeHelpers'

export const CreateHtmlActionUtil = registerActionUtil(
	class CreateHtmlActionUtil extends AgentActionUtil<CreateHtmlAction> {
		static override type = 'createHtml' as const

		override getInfo(action: Streaming<CreateHtmlAction>) {
			return {
				icon: 'note' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<CreateHtmlAction>, helpers: AgentHelpers) {
			sanitizeHtmlShapeAction(this.editor, action, helpers, { w: 400, h: 300 })
			return action
		}

		override applyAction(action: Streaming<CreateHtmlAction>, helpers: AgentHelpers) {
			// The html only streams in as one big chunk from the JSON parser's point
			// of view (it's a single string field) - wait for the action to fully
			// complete before creating the shape, rather than rendering partial/
			// truncated HTML into the iframe.
			if (!action.complete) return
			if (!action.shapeId || !action.html) return

			const { x, y, w, h } = helpers.removeOffsetFromBox({
				x: action.x,
				y: action.y,
				w: action.w,
				h: action.h,
			})

			upsertHtmlShape(this.editor, { shapeId: action.shapeId, x, y, w, h, html: action.html })
		}
	}
)
