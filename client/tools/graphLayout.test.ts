import { describe, expect, it } from 'vitest'
import { computeGraphLayout, renderGraph } from './graphLayout'

describe('renderGraph', () => {
	it('lays out a cyclic flowchart without hanging or producing NaN (regression: this used to hang the tab)', () => {
		const html = renderGraph(
			[
				{ id: 'start', label: 'Start' },
				{ id: 'check', label: 'mid == target?', shape: 'diamond' },
				{ id: 'return', label: 'Return index' },
				{ id: 'narrow', label: 'Narrow range' },
			],
			[
				{ from: 'start', to: 'check' },
				{ from: 'check', to: 'return', label: 'yes' },
				{ from: 'check', to: 'narrow', label: 'no' },
				{ from: 'narrow', to: 'check' }, // the loop-back edge that caused the hang
			],
			{ width: 560, height: 428, direction: 'vertical', arrows: true }
		)
		expect(html).not.toContain('NaN')
		expect(html).toContain('Return index')
		expect(html).toContain('Narrow range')
	})

	it('lays out a plain concept map with no NaN', () => {
		const html = renderGraph(
			[
				{ id: 'A', label: 'Neuron' },
				{ id: 'B', label: 'Layer' },
				{ id: 'C', label: 'Network' },
			],
			[
				{ from: 'A', to: 'B', label: 'forms' },
				{ from: 'B', to: 'C', label: 'builds' },
			],
			{ width: 800, height: 300, direction: 'horizontal', arrows: false }
		)
		expect(html).not.toContain('NaN')
	})

	it('handles a single node with no edges', () => {
		const html = renderGraph([{ id: 'A', label: 'Solo' }], [], {
			width: 300,
			height: 200,
			direction: 'vertical',
			arrows: true,
		})
		expect(html).not.toContain('NaN')
	})

	it('handles a pure 2-cycle with no acyclic entry point (regression: worst case for the old relaxation bug)', () => {
		const html = renderGraph(
			[
				{ id: 'A', label: 'A' },
				{ id: 'B', label: 'B' },
			],
			[
				{ from: 'A', to: 'B' },
				{ from: 'B', to: 'A' },
			],
			{ width: 300, height: 300, direction: 'vertical', arrows: true }
		)
		expect(html).not.toContain('NaN')
	})
})

describe('computeGraphLayout', () => {
	it('produces finite, non-overlapping positions for every node', () => {
		const { positions } = computeGraphLayout(
			[
				{ id: 'A', label: 'A' },
				{ id: 'B', label: 'B' },
				{ id: 'C', label: 'C' },
				{ id: 'D', label: 'D' },
			],
			[
				{ from: 'A', to: 'B' },
				{ from: 'A', to: 'C' },
				{ from: 'B', to: 'D' },
				{ from: 'C', to: 'D' },
			],
			{ width: 450, height: 500, direction: 'vertical', arrows: false }
		)

		expect(positions.size).toBe(4)
		const seen = new Set<string>()
		for (const [id, p] of positions) {
			expect(Number.isFinite(p.x), `${id}.x should be finite`).toBe(true)
			expect(Number.isFinite(p.y), `${id}.y should be finite`).toBe(true)
			const key = `${p.x.toFixed(1)},${p.y.toFixed(1)}`
			expect(seen.has(key), `${id} should not land exactly on another node`).toBe(false)
			seen.add(key)
		}
	})

	it('silently drops edges that reference an unknown node id instead of crashing', () => {
		const { edges } = computeGraphLayout(
			[{ id: 'A', label: 'A' }],
			[{ from: 'A', to: 'does-not-exist' }],
			{ width: 300, height: 300, direction: 'vertical', arrows: false }
		)
		expect(edges).toHaveLength(0)
	})
})
