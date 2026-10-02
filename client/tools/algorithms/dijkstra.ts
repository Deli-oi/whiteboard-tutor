import { GraphEdge, GraphNode } from '../graphLayout'
import { AlgorithmStep } from './types'

/**
 * Computes Dijkstra's algorithm's exact step-by-step trace deterministically,
 * rather than asking a model to hand-simulate it (which it reliably gets
 * wrong on anything but trivial graphs - wrong visit order, missed nodes,
 * wrong distances). Edge weights come from `edge.label` parsed as a number;
 * an edge with a missing/invalid weight defaults to 1. Treats edges as
 * undirected (Dijkstra visualizations are almost always drawn that way) -
 * each edge can be relaxed from either endpoint.
 */
export function computeDijkstraSteps(
	nodes: GraphNode[],
	edges: GraphEdge[],
	startNodeId: string
): AlgorithmStep[] {
	const weight = (edge: GraphEdge): number => {
		const parsed = edge.label ? parseFloat(edge.label) : NaN
		return Number.isFinite(parsed) ? parsed : 1
	}

	const neighbors = new Map<string, { to: string; edge: GraphEdge }[]>()
	for (const node of nodes) neighbors.set(node.id, [])
	for (const edge of edges) {
		neighbors.get(edge.from)?.push({ to: edge.to, edge })
		neighbors.get(edge.to)?.push({ to: edge.from, edge })
	}

	const dist = new Map<string, number>(nodes.map((n) => [n.id, Infinity]))
	const visited = new Set<string>()
	dist.set(startNodeId, 0)

	const steps: AlgorithmStep[] = []
	const formatDist = (id: string) => {
		const d = dist.get(id)
		return d === undefined || d === Infinity ? '∞' : String(d)
	}
	const allDistancesSummary = () =>
		nodes.map((n) => `${n.label}=${formatDist(n.id)}`).join(', ')

	steps.push({
		description: `Start at ${nodes.find((n) => n.id === startNodeId)?.label ?? startNodeId} with distance 0, every other node at infinity. (${allDistancesSummary()})`,
		activeNodeIds: [startNodeId],
		visitedNodeIds: [],
		activeEdges: [],
	})

	while (visited.size < nodes.length) {
		// Pick the unvisited node with the smallest known distance.
		let currentId: string | null = null
		let currentDist = Infinity
		for (const node of nodes) {
			if (visited.has(node.id)) continue
			const d = dist.get(node.id)!
			if (d < currentDist) {
				currentDist = d
				currentId = node.id
			}
		}
		// Nothing left reachable - remaining nodes are disconnected from start.
		if (currentId === null || currentDist === Infinity) break

		const current = currentId
		visited.add(current)
		const currentLabel = nodes.find((n) => n.id === current)?.label ?? current

		const relaxedEdges: { from: string; to: string }[] = []
		for (const { to, edge } of neighbors.get(current) ?? []) {
			if (visited.has(to)) continue
			const candidate = currentDist + weight(edge)
			if (candidate < (dist.get(to) ?? Infinity)) {
				dist.set(to, candidate)
				relaxedEdges.push({ from: edge.from, to: edge.to })
			}
		}

		const relaxedLabels = relaxedEdges
			.map(({ to }) => {
				const label = nodes.find((n) => n.id === to)?.label ?? to
				return `${label}=${formatDist(to)}`
			})
			.join(', ')

		steps.push({
			description: relaxedLabels
				? `Visit ${currentLabel} (distance ${currentDist}, now finalized). Relax its edges: ${relaxedLabels}.`
				: `Visit ${currentLabel} (distance ${currentDist}, now finalized). No shorter paths found through it.`,
			activeNodeIds: [current],
			visitedNodeIds: Array.from(visited),
			activeEdges: relaxedEdges,
		})
	}

	steps.push({
		description: `Done. Shortest distances from ${nodes.find((n) => n.id === startNodeId)?.label ?? startNodeId}: ${allDistancesSummary()}.`,
		activeNodeIds: [],
		visitedNodeIds: Array.from(visited),
		activeEdges: [],
	})

	return steps
}
