export interface AlgorithmStep {
	description: string
	activeNodeIds: string[]
	visitedNodeIds: string[]
	activeEdges: { from: string; to: string }[]
}
