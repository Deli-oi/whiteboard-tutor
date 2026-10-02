import { CreateFlowchartAction } from '../../shared/schema/AgentActionSchemas'
import { GRAPH_STYLES, renderGraph } from './graphLayout'
import { renderMathText } from './mathText'
import { contentSize, wrapTemplateHtml } from './templateShell'

export function renderFlowchart(action: CreateFlowchartAction, w: number, h: number): string {
	const content = contentSize(w, h)
	const titleHtml = action.title
		? `<div class="tool-title">${renderMathText(action.title)}</div>`
		: ''
	const titleHeight = action.title ? 32 : 0

	const graph = renderGraph(action.nodes, action.edges, {
		width: content.w - 24,
		height: content.h - 24 - titleHeight,
		direction: 'vertical',
		arrows: true,
	})

	return wrapTemplateHtml(
		`<div style="padding: 12px;">${titleHtml}${graph}</div>`,
		GRAPH_STYLES
	)
}
