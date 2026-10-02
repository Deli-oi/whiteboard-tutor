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
const MIN_NODE_W = 110
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
 * Lays out a node/edge graph into levels by BFS distance from whichever
 * nodes have no incoming edges (so a hierarchy or process naturally reads
 * root-to-leaf / start-to-end). Shared by every graph-shaped tool - the
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

	const incoming = new Map<string, number>()
	const outgoing = new Map<string, string[]>()
	for (const node of rawNodes) {
		incoming.set(node.id, 0)
		outgoing.set(node.id, [])
	}
	for (const edge of edges) {
		incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
		outgoing.get(edge.from)?.push(edge.to)
	}

	const level = new Map<string, number>()
	const queue: string[] = []
	for (const node of rawNodes) {
		if (incoming.get(node.id) === 0) {
			level.set(node.id, 0)
			queue.push(node.id)
		}
	}
	// Graphs with no zero-indegree node (a pure cycle) still need a starting
	// point - just seed every remaining node at level 0 so layout can proceed.
	for (const node of rawNodes) {
		if (!level.has(node.id)) {
			level.set(node.id, 0)
			queue.push(node.id)
		}
	}
	// Longest-path layering by relaxation (like Bellman-Ford). A flowchart with
	// a "loop back" edge is a cycle, which would otherwise push a node's level
	// higher forever as the cycle gets walked repeatedly - capping how many
	// times any one node can be relaxed (the standard Bellman-Ford termination
	// bound) guarantees this converges instead of hanging the tab.
	const relaxCount = new Map<string, number>()
	while (queue.length > 0) {
		const id = queue.shift()!
		const currentLevel = level.get(id)!
		for (const next of outgoing.get(id) ?? []) {
			const candidate = currentLevel + 1
			const nextRelaxCount = relaxCount.get(next) ?? 0
			if (
				(level.get(next) === undefined || candidate > level.get(next)!) &&
				nextRelaxCount < rawNodes.length
			) {
				level.set(next, candidate)
				relaxCount.set(next, nextRelaxCount + 1)
				queue.push(next)
			}
		}
	}

	// Compact level numbers to a contiguous 0..k range. The relaxation above
	// can leave gaps (e.g. a cycle capped out at level 5 while nothing landed
	// on 2, 3, or 4) - left as-is, that produces a sparse `levels` array, and
	// spreading a sparse array's holes into Math.max() below would yield
	// `undefined` and poison every size computation to NaN. Compacting also
	// avoids pointless empty rows/columns in the rendered layout.
	const usedLevels = Array.from(new Set(rawNodes.map((n) => level.get(n.id) ?? 0))).sort(
		(a, b) => a - b
	)
	const levelRank = new Map(usedLevels.map((l, i) => [l, i]))

	const levels: GraphNode[][] = []
	for (const node of rawNodes) {
		const l = levelRank.get(level.get(node.id) ?? 0)!
		levels[l] = levels[l] ?? []
		levels[l].push(node)
	}

	const levelCount = levels.length
	const maxPerLevel = Math.max(1, ...levels.map((l) => (l ? l.length : 0)))

	const isVertical = options.direction === 'vertical'
	const mainAxisSize = isVertical ? options.height : options.width
	const crossAxisSize = isVertical ? options.width : options.height
	const levelStep = levelCount > 0 ? mainAxisSize / levelCount : mainAxisSize
	// Size along the cross axis (perpendicular to flow direction) scales with
	// how many nodes share a level; size along the main axis (flow direction)
	// is a constant box thickness, clamped down if levels are packed tightly.
	const crossSize = Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, crossAxisSize / maxPerLevel - NODE_MARGIN))
	const mainSize = Math.min(NODE_H, levelStep * 0.7)

	const positions = new Map<string, { x: number; y: number }>()
	levels.forEach((levelNodes, levelIndex) => {
		if (!levelNodes) return
		const crossStep = crossAxisSize / levelNodes.length
		levelNodes.forEach((node, i) => {
			const mainPos = levelIndex * levelStep + levelStep / 2
			const crossPos = i * crossStep + crossStep / 2
			positions.set(node.id, isVertical ? { x: crossPos, y: mainPos } : { x: mainPos, y: crossPos })
		})
	})

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
