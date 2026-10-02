import dagre from '@dagrejs/dagre'
import { renderMathText } from './mathText'

export interface GraphNode {
	id: string
	label: string
	shape?: 'rect' | 'diamond'
}

export interface GraphEdge {
	from: string
	to: string
	label?: string
}

interface LayoutOptions {
	width: number
	height: number
	/** 'vertical' flows top-to-bottom (flowchart); 'horizontal' flows left-to-right (concept map). */
	direction: 'horizontal' | 'vertical'
	/** Whether edges get arrowheads (directed flowchart) or plain lines (concept map). */
	arrows: boolean
}

const NODE_MARGIN = 16
const MAX_NODE_W = 170
const NODE_H = 56

export interface GraphLayoutResult {
	/** Center point of each node, in pixels within the `width`x`height` box. */
	positions: Map<string, { x: number; y: number }>
	/** `rawEdges` filtered down to ones where both ends are real nodes. */
	edges: GraphEdge[]
	/** Node size along the cross axis (perpendicular to flow direction). */
	crossSize: number
	/** Node size along the main axis (the flow direction). */
	mainSize: number
	isVertical: boolean
}

/**
 * Lays out a node/edge graph with `dagre` (the same layered-DAG algorithm
 * Mermaid uses internally) rather than a hand-rolled layering pass - an
 * earlier hand-rolled version of this function hung the tab on a cyclic
 * graph (no termination bound on its level-relaxation loop) and separately
 * produced NaN positions (a sparse-array bug), both found live. `dagre`
 * handles cycles itself (`acyclicer: 'greedy'` breaks them before layout)
 * and has no such failure modes. Shared by every graph-shaped tool - the
 * static ones (renderGraph, below) and interactive ones that need the raw
 * positions to attach their own ids/handlers (e.g. an algorithm walkthrough
 * that highlights nodes step by step).
 */
export function computeGraphLayout(
	rawNodes: GraphNode[],
	rawEdges: GraphEdge[],
	options: LayoutOptions
): GraphLayoutResult {
	const nodeIds = new Set(rawNodes.map((n) => n.id))
	const edges = rawEdges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
	const isVertical = options.direction === 'vertical'

	// Every node gets the same base footprint (diamonds are enlarged visually
	// at render time, after layout, same as before) - dagre needs a size per
	// node up front, but doesn't need to know the overall target box; the
	// whole graph is scaled to fit options.width x options.height afterward.
	const nodeWidth = isVertical ? MAX_NODE_W : NODE_H
	const nodeHeight = isVertical ? NODE_H : MAX_NODE_W

	const g = new dagre.graphlib.Graph()
	g.setGraph({
		rankdir: isVertical ? 'TB' : 'LR',
		nodesep: NODE_MARGIN,
		ranksep: NODE_MARGIN * 2,
		acyclicer: 'greedy',
	})
	g.setDefaultEdgeLabel(() => ({}))
	for (const node of rawNodes) {
		g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
	}
	for (const edge of edges) {
		g.setEdge(edge.from, edge.to)
	}
	dagre.layout(g)

	const graphLabel = g.graph()
	const naturalWidth = graphLabel.width || options.width
	const naturalHeight = graphLabel.height || options.height
	const scaleX = options.width / naturalWidth
	const scaleY = options.height / naturalHeight

	const positions = new Map<string, { x: number; y: number }>()
	for (const node of rawNodes) {
		const placed = g.node(node.id)
		if (!placed) continue
		positions.set(node.id, { x: placed.x * scaleX, y: placed.y * scaleY })
	}

	// crossSize/mainSize are reported back scaled the same way positions are,
	// so a node rendered at this size lines up with where dagre (then the
	// fit-to-box scale) put it.
	const crossSize = isVertical ? nodeWidth * scaleX : nodeHeight * scaleY
	const mainSize = isVertical ? nodeHeight * scaleY : nodeWidth * scaleX

	return { positions, edges, crossSize, mainSize, isVertical }
}

/**
 * Renders a computed layout as fully static, absolutely-positioned HTML
 * boxes over an SVG layer of connecting lines - no runtime script needed,
 * unlike createHtml's sandboxed documents.
 */
export function renderGraph(
	rawNodes: GraphNode[],
	rawEdges: GraphEdge[],
	options: LayoutOptions
): string {
	const { positions, edges, crossSize, mainSize, isVertical } = computeGraphLayout(
		rawNodes,
		rawEdges,
		options
	)

	const nodeHtml = rawNodes
		.map((node) => {
			const pos = positions.get(node.id)
			if (!pos) return ''
			const isDiamond = node.shape === 'diamond'
			const baseW = isVertical ? crossSize : mainSize
			const baseH = isVertical ? mainSize : crossSize
			const w = isDiamond ? baseW * 1.15 : baseW
			const h = isDiamond ? baseH * 1.3 : baseH
			const style = isDiamond
				? `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); background: #fef3c7; border: 1.5px solid #d97706;`
				: `border-radius: 8px; background: #eff6ff; border: 1.5px solid #3b82f6;`
			return `<div class="graph-node" style="left:${pos.x - w / 2}px; top:${pos.y - h / 2}px; width:${w}px; height:${h}px; ${style}">
				<span>${renderMathText(node.label)}</span>
			</div>`
		})
		.join('')

	const svgLines = edges
		.map((edge) => {
			const from = positions.get(edge.from)
			const to = positions.get(edge.to)
			if (!from || !to) return ''
			const markerAttr = options.arrows ? ' marker-end="url(#arrowhead)"' : ''
			return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#64748b" stroke-width="1.5"${markerAttr} />`
		})
		.join('')

	const edgeLabels = edges
		.filter((e) => e.label)
		.map((edge) => {
			const from = positions.get(edge.from)
			const to = positions.get(edge.to)
			if (!from || !to) return ''
			const midX = (from.x + to.x) / 2
			const midY = (from.y + to.y) / 2
			return `<span class="edge-label" style="left:${midX}px; top:${midY}px;">${renderMathText(edge.label!)}</span>`
		})
		.join('')

	const arrowDef = options.arrows
		? `<defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#64748b" /></marker></defs>`
		: ''

	return `<div class="graph-container" style="position: relative; width: ${options.width}px; height: ${options.height}px;">
		<svg width="${options.width}" height="${options.height}" style="position: absolute; top:0; left:0;">${arrowDef}${svgLines}</svg>
		${nodeHtml}
		${edgeLabels}
	</div>`
}

export const GRAPH_STYLES = `
	.graph-node {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 8px;
		font-size: 12.5px;
		line-height: 1.25;
		overflow: hidden;
		word-break: break-word;
	}
	.edge-label {
		position: absolute;
		transform: translate(-50%, -50%);
		background: white;
		padding: 1px 5px;
		border-radius: 4px;
		font-size: 11px;
		color: #475569;
		border: 1px solid #e2e8f0;
		white-space: nowrap;
	}
`
