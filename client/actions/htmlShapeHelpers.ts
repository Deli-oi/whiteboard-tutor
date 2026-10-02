import { Editor, TLShapeId } from 'tldraw'
import { SimpleShapeId } from '../../shared/types/ids-schema'
import { AgentHelpers } from '../AgentHelpers'

interface ShapeIdFields {
	shapeId?: SimpleShapeId
}

interface SizeFields {
	w?: number
	h?: number
}

/**
 * Shared by every action that produces an `html` shape (createHtml and the
 * template tools: concept map, timeline, comparison table, flowchart,
 * annotated diagram). Reusing the id of an existing html shape means "edit
 * that one in place" - don't rename it out from under the model. Anything
 * else (new id, or an id collision with a non-html shape) gets the normal
 * uniqueness treatment. Mutates `action` in place, matching the rest of this
 * codebase's `sanitizeAction` pattern.
 */
export function sanitizeHtmlShapeAction<T extends ShapeIdFields & SizeFields>(
	editor: Editor,
	action: T,
	helpers: AgentHelpers,
	defaults: { w: number; h: number }
): void {
	if (action.shapeId) {
		const existing = editor.getShape(`shape:${action.shapeId}` as TLShapeId)
		if (!existing || existing.type !== 'html') {
			action.shapeId = helpers.ensureShapeIdIsUnique(action.shapeId)
		}
	}
	if ('w' in action) action.w = helpers.ensureValueIsNumber(action.w) ?? defaults.w
	if ('h' in action) action.h = helpers.ensureValueIsNumber(action.h) ?? defaults.h
}

/**
 * If `{x, y, w, h}` doesn't overlap any existing shape, use it as-is.
 * Otherwise place it to the right of the rightmost shape currently on the
 * page (with a margin), nudging further if that still collides.
 */
function findNonOverlappingPosition(
	editor: Editor,
	requested: { x: number; y: number; w: number; h: number }
): { x: number; y: number } {
	const MARGIN = 40

	const others = editor
		.getCurrentPageShapesSorted()
		.map((shape) => editor.getShapeMaskedPageBounds(shape))
		.filter((bounds): bounds is NonNullable<typeof bounds> => !!bounds)

	const overlapsAny = (x: number, y: number) =>
		others.some(
			(b) => x < b.x + b.w && x + requested.w > b.x && y < b.y + b.h && y + requested.h > b.y
		)

	if (others.length === 0 || !overlapsAny(requested.x, requested.y)) {
		return { x: requested.x, y: requested.y }
	}

	const maxRight = Math.max(requested.x, ...others.map((b) => b.x + b.w))
	let x = maxRight + MARGIN
	let y = requested.y
	let attempts = 0
	while (overlapsAny(x, y) && attempts < 20) {
		x += MARGIN
		y += MARGIN
		attempts++
	}
	return { x, y }
}

/**
 * Creates or updates the `html` shape for `shapeId`. Same id as an existing
 * html shape is treated as an edit (position/size stay put, only content
 * changes); a new id gets auto-placed so it never lands on top of something
 * already on the board.
 */
export function upsertHtmlShape(
	editor: Editor,
	params: { shapeId: string; x: number; y: number; w: number; h: number; html: string }
): void {
	const realId = `shape:${params.shapeId}` as TLShapeId
	const existing = editor.getShape(realId)

	if (existing && existing.type === 'html') {
		editor.updateShape({
			id: realId,
			type: 'html',
			props: { w: params.w, h: params.h, html: params.html },
		})
		return
	}

	const pos = findNonOverlappingPosition(editor, params)
	editor.createShape({
		id: realId,
		type: 'html',
		x: pos.x,
		y: pos.y,
		props: { w: params.w, h: params.h, html: params.html },
	})
}
