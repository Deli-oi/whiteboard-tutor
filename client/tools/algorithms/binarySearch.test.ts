import { describe, expect, it } from 'vitest'
import { computeBinarySearchSteps } from './binarySearch'

describe('computeBinarySearchSteps', () => {
	it('finds the target', () => {
		const steps = computeBinarySearchSteps([1, 3, 5, 7, 9, 11], 7)
		const finalStep = steps.at(-1)!
		expect(finalStep.description).toContain('Found it at index 3')
	})

	it('reports not-found and still terminates with a clear end state', () => {
		const steps = computeBinarySearchSteps([1, 3, 5, 7, 9, 11], 4)
		const finalStep = steps.at(-1)!
		expect(finalStep.description).toContain('not in the array')
	})
})
