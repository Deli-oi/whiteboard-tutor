import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFragment, storeFragment } from './fragmentCache'

describe('fragmentCache', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('returns what was stored, keyed by the returned id', () => {
		const id = storeFragment('<p>hello</p>')
		expect(getFragment(id)).toBe('<p>hello</p>')
	})

	it('gives each call a distinct, unguessable id', () => {
		const a = storeFragment('<p>a</p>')
		const b = storeFragment('<p>b</p>')
		expect(a).not.toBe(b)
		expect(getFragment(a)).toBe('<p>a</p>')
		expect(getFragment(b)).toBe('<p>b</p>')
	})

	it('returns null for an unknown id', () => {
		expect(getFragment('not-a-real-id')).toBeNull()
	})

	it('expires an entry after its TTL', () => {
		const id = storeFragment('<p>temp</p>')
		expect(getFragment(id)).toBe('<p>temp</p>')
		vi.advanceTimersByTime(6 * 60 * 1000)
		expect(getFragment(id)).toBeNull()
	})
})
