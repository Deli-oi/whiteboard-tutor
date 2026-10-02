import { Box, FileHelpers, TLShape } from 'tldraw'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import { ImageContextPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

/**
 * Finds image shapes that are selected or within the request's bounds (the
 * viewport, or a circled/picked area) and renders each to a data URL so a
 * multimodal model can actually read it - a screenshot pasted onto the canvas,
 * circled and asked about, otherwise has no content the agent can see.
 *
 * Deliberately cheap when there's nothing to do: unlike `ScreenshotPart`, this
 * is safe to include in every mode (including tutor) because it costs nothing
 * - no render, no data URL - unless an image shape is actually relevant.
 */
export const ImageContextPartUtil = registerPromptPartUtil(
	class ImageContextPartUtil extends PromptPartUtil<ImageContextPart> {
		static override type = 'imageContext' as const

		override async getPart(request: AgentRequest): Promise<ImageContextPart> {
			const { editor } = this

			const contextBoundsBox = Box.From(request.bounds)
			const inBounds = editor.getCurrentPageShapesSorted().filter((shape) => {
				const bounds = editor.getShapeMaskedPageBounds(shape)
				return bounds ? contextBoundsBox.includes(bounds) : false
			})
			const selected = editor.getSelectedShapes()

			const relevant = new Map<string, TLShape>()
			for (const shape of [...selected, ...inBounds]) {
				if (shape.type === 'image') relevant.set(shape.id, shape)
			}

			if (relevant.size === 0) {
				return { type: 'imageContext', images: [] }
			}

			const images = await Promise.all(
				Array.from(relevant.values()).map(async (shape) => {
					const result = await editor.toImage([shape], {
						format: 'jpeg',
						background: true,
						padding: 0,
					})
					return {
						shapeId: convertTldrawIdToSimpleId(shape.id),
						dataUrl: await FileHelpers.blobToDataUrl(result.blob),
					}
				})
			)

			return { type: 'imageContext', images }
		}
	}
)
