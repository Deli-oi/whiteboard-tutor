import { GraphEdge, GraphNode } from '../graphLayout'
import { AlgorithmStep } from './types'

/**
 * Computes breadth-first search's exact step-by-step trace deterministically
 * - same rationale as dijkstra.ts: a model hand-simulating traversal order
 * reliably gets it wrong. Treats edges as undirected.
 */
export function computeBfsSteps(
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

	const visited = new Set<string>([startNodeId])
	const queue: string[] = [startNodeId]
	const steps: AlgorithmStep[] = [
		{
			description: `Start at ${labelOf(startNodeId)}. Add it to the queue.`,
			activeNodeIds: [startNodeId],
			visitedNodeIds: [startNodeId],
			activeEdges: [],
		},
	]

	while (queue.length > 0) {
		const current = queue.shift()!
		const newlyDiscovered: string[] = []
		const traversedEdges: { from: string; to: string }[] = []

		for (const next of neighbors.get(current) ?? []) {
			if (visited.has(next)) continue
			visited.add(next)
			queue.push(next)
			newlyDiscovered.push(next)
			traversedEdges.push({ from: current, to: next })
		}

		steps.push({
			description:
				newlyDiscovered.length > 0
					? `Dequeue ${labelOf(current)}. Discover and enqueue: ${newlyDiscovered.map(labelOf).join(', ')}.`
					: `Dequeue ${labelOf(current)}. No new nodes to discover (all neighbors already visited).`,
			activeNodeIds: [current],
			visitedNodeIds: Array.from(visited),
			activeEdges: traversedEdges,
		})
	}

	steps.push({
		description: `Done. Visit order from ${labelOf(startNodeId)}: ${Array.from(visited).map(labelOf).join(' → ')}.`,
		activeNodeIds: [],
		visitedNodeIds: Array.from(visited),
		activeEdges: [],
	})

	return steps
}
