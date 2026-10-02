import { GraphEdge, GraphNode } from '../graphLayout'
import { AlgorithmStep } from './types'

/**
 * Computes depth-first search's exact step-by-step trace deterministically -
 * same rationale as dijkstra.ts. Recursive (pre-order), treats edges as
 * undirected, and visits neighbors in the order they were given.
 */
export function computeDfsSteps(
	nodes: GraphNode[],
	edges: GraphEdge[],
	startNodeId: string
): AlgorithmStep[] {
	const neighbors = new Map<string, string[]>()
	for (const node of nodes) neighbors.set(node.id, [])
	for (const edge of edges) {
		neighbors.get(edge.from)?.push(edge.to)
		neighbors.get(edge.to)?.push(edge.from)
	}

	const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id

	const visited = new Set<string>()
	const steps: AlgorithmStep[] = []

	function visit(nodeId: string, viaEdge: { from: string; to: string } | null) {
		visited.add(nodeId)
		steps.push({
			description: viaEdge
				? `Follow the edge to ${labelOf(nodeId)} and visit it.`
				: `Start at ${labelOf(nodeId)} and visit it.`,
			activeNodeIds: [nodeId],
			visitedNodeIds: Array.from(visited),
			activeEdges: viaEdge ? [viaEdge] : [],
		})

		for (const next of neighbors.get(nodeId) ?? []) {
			if (visited.has(next)) continue
			visit(next, { from: nodeId, to: next })
		}

		steps.push({
			description: `Backtrack from ${labelOf(nodeId)} - no more unvisited neighbors.`,
			activeNodeIds: [nodeId],
			visitedNodeIds: Array.from(visited),
			activeEdges: [],
		})
	}

	visit(startNodeId, null)

	steps.push({
		description: `Done. Visit order from ${labelOf(startNodeId)}: ${Array.from(visited).map(labelOf).join(' → ')}.`,
		activeNodeIds: [],
		visitedNodeIds: Array.from(visited),
		activeEdges: [],
	})

	return steps
}
