import { describe, expect, it } from 'vitest'
import { closeAndParseJson } from './closeAndParseJson'

describe('closeAndParseJson', () => {
	it('parses already-complete JSON unchanged', () => {
		expect(closeAndParseJson('{"a":1,"b":[1,2,3]}')).toEqual({ a: 1, b: [1, 2, 3] })
	})

	it('closes a truncated object', () => {
		expect(closeAndParseJson('{"a":1,"b":2')).toEqual({ a: 1, b: 2 })
	})

	it('closes a truncated array', () => {
		expect(closeAndParseJson('[1,2,3')).toEqual([1, 2, 3])
	})

	it('closes an unterminated string value', () => {
		expect(closeAndParseJson('{"text":"still streaming')).toEqual({ text: 'still streaming' })
	})

	it('closes nested, mixed, truncated structures', () => {
		expect(closeAndParseJson('{"actions":[{"_type":"message","text":"hi')).toEqual({
			actions: [{ _type: 'message', text: 'hi' }],
		})
	})

	it('does not treat an escaped quote inside a string as closing it', () => {
		expect(closeAndParseJson('{"text":"she said \\"hi')).toEqual({ text: 'she said "hi' })
	})

	it('ignores brace/bracket-looking characters inside a string', () => {
		expect(closeAndParseJson('{"text":"look: { [ not real brackets"')).toEqual({
			text: 'look: { [ not real brackets',
		})
	})

	it('returns null for input that is not recoverable as JSON', () => {
		expect(closeAndParseJson('not json at all')).toBeNull()
	})

	it('returns null for an empty string', () => {
		expect(closeAndParseJson('')).toBeNull()
	})
})
