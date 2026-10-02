import { describe, expect, it } from 'vitest'
import { computeTwoSumSteps } from './twoSum'

describe('computeTwoSumSteps', () => {
	it('finds the pair (regression: a hand-written version of this stepper lost its Next button once the pair was found)', () => {
		const steps = computeTwoSumSteps([2, 7, 11, 15], 9)
		const finalStep = steps.at(-1)!
		expect(finalStep.description).toContain('Found the pair: indices [0, 1]')
		expect(finalStep.pointers.map((p) => p.role)).toEqual(['found', 'found'])
	})

	it('reports no solution and still terminates with a clear end state', () => {
		const steps = computeTwoSumSteps([1, 2, 3], 100)
		const finalStep = steps.at(-1)!
		expect(finalStep.description).toContain('No solution exists')
		expect(finalStep.pointers).toHaveLength(0)
	})
})
