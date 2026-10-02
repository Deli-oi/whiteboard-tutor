import { ArrayStep } from './arrayTypes'

/**
 * Computes Two Sum's exact one-pass hash-map trace deterministically. A
 * model hand-writing this (as seen in a real logged fallback) reliably
 * leaves out the end state - the "not found" case, or forgets to re-render
 * a Next button after the match is found, leaving a dead stepper.
 */
export function computeTwoSumSteps(array: number[], target: number): ArrayStep[] {
	const seen = new Map<number, number>()
	const steps: ArrayStep[] = [
		{
			description: `Looking for two numbers in [${array.join(', ')}] that add up to ${target}. Scan left to right, remembering every number seen so far.`,
			pointers: [],
		},
	]

	for (let i = 0; i < array.length; i++) {
		const complement = target - array[i]
		const matchIndex = seen.get(complement)

		if (matchIndex !== undefined) {
			steps.push({
				description: `At index ${i} (value ${array[i]}): need ${complement}, and it was already seen at index ${matchIndex}. Found the pair: indices [${matchIndex}, ${i}] (${array[matchIndex]} + ${array[i]} = ${target}).`,
				pointers: [
					{ index: matchIndex, label: 'match', role: 'found' },
					{ index: i, label: 'i', role: 'found' },
				],
			})
			return steps
		}

		steps.push({
			description: `At index ${i} (value ${array[i]}): need ${complement} to reach ${target}, not seen yet. Remember that ${array[i]} is at index ${i}.`,
			pointers: [{ index: i, label: 'i', role: 'active' }],
		})
		seen.set(array[i], i)
	}

	steps.push({
		description: `Reached the end with no pair summing to ${target}. No solution exists in this array.`,
		pointers: [],
	})
	return steps
}
