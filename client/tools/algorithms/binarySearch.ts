import { ArrayStep } from './arrayTypes'

/**
 * Computes binary search's exact trace deterministically. Assumes `array` is
 * already sorted ascending (the caller/model is responsible for that, same
 * as the real algorithm's precondition).
 */
export function computeBinarySearchSteps(array: number[], target: number): ArrayStep[] {
	let lo = 0
	let hi = array.length - 1
	const steps: ArrayStep[] = [
		{
			description: `Searching for ${target} in [${array.join(', ')}] (must already be sorted ascending).`,
			pointers: [],
		},
	]

	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2)
		const pointers = [
			{ index: lo, label: 'lo', role: 'lo' as const },
			{ index: mid, label: 'mid', role: 'mid' as const },
			{ index: hi, label: 'hi', role: 'hi' as const },
		]

		if (array[mid] === target) {
			steps.push({
				description: `mid = ${mid} (value ${array[mid]}) equals the target ${target}. Found it at index ${mid}.`,
				pointers: [{ index: mid, label: 'found', role: 'found' }],
			})
			return steps
		}

		if (array[mid] < target) {
			steps.push({
				description: `mid = ${mid} (value ${array[mid]}) is less than ${target}, so the answer must be to the right. Move lo to ${mid + 1}.`,
				pointers,
			})
			lo = mid + 1
		} else {
			steps.push({
				description: `mid = ${mid} (value ${array[mid]}) is greater than ${target}, so the answer must be to the left. Move hi to ${mid - 1}.`,
				pointers,
			})
			hi = mid - 1
		}
	}

	steps.push({
		description: `lo (${lo}) has passed hi (${hi}) - the search space is empty. ${target} is not in the array.`,
		pointers: [],
	})
	return steps
}
