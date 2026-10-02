import { CreateComparisonTableAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { renderComparisonTable } from '../tools/comparisonTableTemplate'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { sanitizeHtmlShapeAction, upsertHtmlShape } from './htmlShapeHelpers'

export const CreateComparisonTableActionUtil = registerActionUtil(
	class CreateComparisonTableActionUtil extends AgentActionUtil<CreateComparisonTableAction> {
		static override type = 'createComparisonTable' as const

		override getInfo(action: Streaming<CreateComparisonTableAction>) {
			return { icon: 'note' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(
			action: Streaming<CreateComparisonTableAction>,
			helpers: AgentHelpers
		) {
			sanitizeHtmlShapeAction(this.editor, action, helpers, { w: 450, h: 300 })
			return action
		}

		override applyAction(action: Streaming<CreateComparisonTableAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			if (!action.shapeId || !action.columns || !action.rows || action.rows.length === 0) return

			const { x, y, w, h } = helpers.removeOffsetFromBox({
				x: action.x,
				y: action.y,
				w: action.w,
				h: action.h,
			})

			const html = renderComparisonTable(action, w, h)
			upsertHtmlShape(this.editor, { shapeId: action.shapeId, x, y, w, h, html })
		}
	}
)
