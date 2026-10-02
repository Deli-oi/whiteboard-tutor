import { FileHelpers, TLShapeId } from 'tldraw'
import { CreateAnnotatedDiagramAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { renderAnnotatedDiagram } from '../tools/annotatedDiagramTemplate'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { sanitizeHtmlShapeAction, upsertHtmlShape } from './htmlShapeHelpers'

export const CreateAnnotatedDiagramActionUtil = registerActionUtil(
	class CreateAnnotatedDiagramActionUtil extends AgentActionUtil<CreateAnnotatedDiagramAction> {
		static override type = 'createAnnotatedDiagram' as const

		override getInfo(action: Streaming<CreateAnnotatedDiagramAction>) {
			return { icon: 'note' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(
			action: Streaming<CreateAnnotatedDiagramAction>,
			helpers: AgentHelpers
		) {
			sanitizeHtmlShapeAction(this.editor, action, helpers, { w: 400, h: 300 })
			return action
		}

		override async applyAction(
			action: Streaming<CreateAnnotatedDiagramAction>,
			helpers: AgentHelpers
		) {
			if (!action.complete) return
			if (!action.shapeId || !action.sourceShapeId || !action.annotations) return

			const { editor } = this
			const sourceShape = editor.getShape(`shape:${action.sourceShapeId}` as TLShapeId)
			if (!sourceShape || sourceShape.type !== 'image') return

			const { x, y, w, h } = helpers.removeOffsetFromBox({
				x: action.x,
				y: action.y,
				w: action.w,
				h: action.h,
			})

			const sourceProps = sourceShape.props as { w: number; h: number }
			const sourceAspect = sourceProps.w / sourceProps.h

			const result = await editor.toImage([sourceShape], {
				format: 'jpeg',
				background: true,
				padding: 0,
			})
			const imageDataUrl = await FileHelpers.blobToDataUrl(result.blob)

			const html = renderAnnotatedDiagram(action, imageDataUrl, sourceAspect, w, h)
			upsertHtmlShape(editor, { shapeId: action.shapeId, x, y, w, h, html })
		}
	}
)
