import { describe, expect, it } from 'vitest'
import { computeDijkstraSteps } from './dijkstra'

const nodes = [
	{ id: 'A', label: 'A' },
	{ id: 'B', label: 'B' },
	{ id: 'C', label: 'C' },
	{ id: 'D', label: 'D' },
]
const edges = [
	{ from: 'A', to: 'B', label: '2' },
	{ from: 'A', to: 'C', label: '5' },
	{ from: 'B', to: 'D', label: '1' },
	{ from: 'C', to: 'D', label: '8' },
]

describe('computeDijkstraSteps', () => {
	it('visits every node and finds the shortest distances (regression: a hand-written version of this exact graph skipped node C)', () => {
		const steps = computeDijkstraSteps(nodes, edges, 'A')
		const finalStep = steps.at(-1)!
		expect(finalStep.visitedNodeIds.sort()).toEqual(['A', 'B', 'C', 'D'])
		expect(finalStep.description).toContain('A=0')
		expect(finalStep.description).toContain('B=2')
		expect(finalStep.description).toContain('C=5')
		expect(finalStep.description).toContain('D=3') // via A->B->D (2+1), not A->C->D (5+8)
	})

	it('terminates cleanly when a node is unreachable from the start', () => {
		const withUnreachable = [...nodes, { id: 'E', label: 'E' }]
		const steps = computeDijkstraSteps(withUnreachable, edges, 'A')
		const finalStep = steps.at(-1)!
		expect(finalStep.description).toContain('E=∞')
	})

	it('defaults a missing/invalid edge weight to 1', () => {
		const steps = computeDijkstraSteps(
			[
				{ id: 'A', label: 'A' },
				{ id: 'B', label: 'B' },
			],
			[{ from: 'A', to: 'B' }],
			'A'
		)
		expect(steps.at(-1)!.description).toContain('B=1')
	})
})
