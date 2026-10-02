import { describe, expect, it } from 'vitest'
import { computeBfsSteps } from './bfs'
import { computeDfsSteps } from './dfs'

// A diamond with a tail: A->B, A->C, B->D, C->D, D->E
const nodes = [
	{ id: 'A', label: 'A' },
	{ id: 'B', label: 'B' },
	{ id: 'C', label: 'C' },
	{ id: 'D', label: 'D' },
	{ id: 'E', label: 'E' },
]
const edges = [
	{ from: 'A', to: 'B' },
	{ from: 'A', to: 'C' },
	{ from: 'B', to: 'D' },
	{ from: 'C', to: 'D' },
	{ from: 'D', to: 'E' },
]

describe('computeBfsSteps', () => {
	it('visits in level order', () => {
		const steps = computeBfsSteps(nodes, edges, 'A')
		expect(steps.at(-1)!.description).toContain('A → B → C → D → E')
		expect(steps.at(-1)!.visitedNodeIds.sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
	})
})

describe('computeDfsSteps', () => {
	it('visits depth-first in edge order and visits every node exactly once', () => {
		const steps = computeDfsSteps(nodes, edges, 'A')
		const finalStep = steps.at(-1)!
		expect(finalStep.visitedNodeIds.sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
		expect(finalStep.description).toContain('A → B → D → C → E')
	})
})
