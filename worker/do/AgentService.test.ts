import { describe, expect, it } from 'vitest'
import { sanitizeMessageAction } from './AgentService'

describe('sanitizeMessageAction', () => {
	it('strips a stray leading bracket from message text', () => {
		const action = { _type: 'message', text: ']That is exactly right.' } as const
		expect(sanitizeMessageAction(action).text).toBe('That is exactly right.')
	})

	it('strips a run of stray structural characters and whitespace', () => {
		const action = { _type: 'message', text: ']}, \n Hello.' } as const
		expect(sanitizeMessageAction(action).text).toBe('Hello.')
	})

	it('leaves normal message text untouched', () => {
		const action = { _type: 'message', text: 'Hello there.' } as const
		expect(sanitizeMessageAction(action).text).toBe('Hello there.')
	})

	it('ignores non-message actions', () => {
		const action = { _type: 'think', text: ']not a message' } as any
		expect(sanitizeMessageAction(action)).toEqual(action)
	})

	it('passes through undefined', () => {
		expect(sanitizeMessageAction(undefined)).toBeUndefined()
	})
})
