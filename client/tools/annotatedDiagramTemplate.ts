import { CreateAnnotatedDiagramAction } from '../../shared/schema/AgentActionSchemas'
import { renderMathText } from './mathText'
import { contentSize, wrapTemplateHtml } from './templateShell'

const STYLES = `
	.diagram-area { position: relative; }
	.diagram-image-box { position: absolute; }
	.diagram-image-box img { display: block; width: 100%; height: 100%; }
	.pin {
		position: absolute;
		transform: translate(-50%, -50%);
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #ef4444;
		color: white;
		font-size: 11px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0,0,0,0.4);
	}
	.pin-label {
		position: absolute;
		background: rgba(17, 24, 39, 0.92);
		color: white;
		padding: 3px 7px;
		border-radius: 5px;
		font-size: 11.5px;
		white-space: nowrap;
		max-width: 220px;
		white-space: normal;
	}
`

/**
 * Fits the image into the available box preserving `sourceAspect`
 * (centered, letterboxed if needed) rather than stretching it - annotation
 * xPercent/yPercent are positioned relative to this fitted image box, not
 * the outer container, so they stay correct regardless of the shape's own
 * (model-guessed) aspect ratio.
 */
export function renderAnnotatedDiagram(
	action: CreateAnnotatedDiagramAction,
	imageDataUrl: string,
	sourceAspect: number,
	w: number,
	h: number
): string {
	const content = contentSize(w, h)
	const titleHtml = action.title
		? `<div class="tool-title">${renderMathText(action.title)}</div>`
		: ''
	const titleHeight = action.title ? 32 : 0
	const availableW = content.w - 24
	const availableH = content.h - 24 - titleHeight

	const availableAspect = availableW / availableH
	const imageW = availableAspect > sourceAspect ? availableH * sourceAspect : availableW
	const imageH = availableAspect > sourceAspect ? availableH : availableW / sourceAspect
	const offsetX = (availableW - imageW) / 2
	const offsetY = (availableH - imageH) / 2

	const pins = action.annotations
		.map((a, i) => {
			const labelAbove = a.yPercent > 15
			const labelStyle = labelAbove
				? `left: ${a.xPercent}%; top: calc(${a.yPercent}% - 30px); transform: translate(-50%, -100%);`
				: `left: ${a.xPercent}%; top: calc(${a.yPercent}% + 16px); transform: translateX(-50%);`
			return `<div class="pin" style="left: ${a.xPercent}%; top: ${a.yPercent}%;">${i + 1}</div>
				<div class="pin-label" style="${labelStyle}">${i + 1}. ${renderMathText(a.label)}</div>`
		})
		.join('')

	return wrapTemplateHtml(
		`<div style="padding: 12px;">${titleHtml}<div class="diagram-area" style="width:${availableW}px; height:${availableH}px;">
			<div class="diagram-image-box" style="left:${offsetX}px; top:${offsetY}px; width:${imageW}px; height:${imageH}px;">
				<img src="${imageDataUrl}" alt="${action.title ? action.title.replace(/"/g, '&quot;') : 'annotated diagram'}">
				${pins}
			</div>
		</div></div>`,
		STYLES
	)
}
