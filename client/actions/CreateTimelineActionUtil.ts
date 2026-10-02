import { CreateTimelineAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { renderTimeline } from '../tools/timelineTemplate'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { sanitizeHtmlShapeAction, upsertHtmlShape } from './htmlShapeHelpers'

export const CreateTimelineActionUtil = registerActionUtil(
	class CreateTimelineActionUtil extends AgentActionUtil<CreateTimelineAction> {
		static override type = 'createTimeline' as const

		override getInfo(action: Streaming<CreateTimelineAction>) {
			return { icon: 'note' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(action: Streaming<CreateTimelineAction>, helpers: AgentHelpers) {
			sanitizeHtmlShapeAction(this.editor, action, helpers, { w: 380, h: 400 })
			return action
		}

		override applyAction(action: Streaming<CreateTimelineAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			if (!action.shapeId || !action.events || action.events.length === 0) return

			const { x, y, w, h } = helpers.removeOffsetFromBox({
				x: action.x,
				y: action.y,
				w: action.w,
				h: action.h,
			})

			const html = renderTimeline(action, w, h)
			upsertHtmlShape(this.editor, { shapeId: action.shapeId, x, y, w, h, html })
		}
	}
)
