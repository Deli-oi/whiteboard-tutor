import { describe, expect, it } from 'vitest'
import { closeAndParseJson } from './closeAndParseJson'
import { normalizeModelText } from './normalizeModelText'

describe('normalizeModelText', () => {
	it('passes a well-formed JSON object straight through', () => {
		expect(normalizeModelText('{"actions":[]}')).toBe('{"actions":[]}')
	})

	it('passes a genuine bare JSON array straight through', () => {
		expect(normalizeModelText('[1,2,3]')).toBe('[1,2,3]')
	})

	it('strips leading whitespace before classifying the response', () => {
		expect(normalizeModelText('   \n  {"actions":[]}')).toBe('{"actions":[]}')
	})

	it('strips a markdown code fence around a JSON object', () => {
		expect(normalizeModelText('```json\n{"actions":[]}\n```')).toBe('{"actions":[]}')
	})

	it('strips a code fence with no language tag', () => {
		expect(normalizeModelText('```\n{"actions":[]}\n```')).toBe('{"actions":[]}')
	})

	it('converts plain prose into message actions, round-trippable by closeAndParseJson', () => {
		const result = normalizeModelText('Hello there.\n\nHow are you?')
		expect(closeAndParseJson(result)).toEqual({
			actions: [
				{ _type: 'message', text: 'Hello there.' },
				{ _type: 'message', text: 'How are you?' },
			],
		})
	})

	it('treats "[ACTION]: {...}" as a marker, not a bare array, and extracts the real action', () => {
		const result = normalizeModelText('[ACTION]: {"_type":"message","text":"hi"}')
		expect(closeAndParseJson(result)).toEqual({ actions: [{ _type: 'message', text: 'hi' }] })
	})

	it('interleaves prose and [ACTION] markers correctly', () => {
		const raw = 'Here is what I found.\n\n[ACTION]: {"_type":"message","text":"inner"}\n\nAnd that is all.'
		const result = normalizeModelText(raw)
		expect(closeAndParseJson(result)).toEqual({
			actions: [
				{ _type: 'message', text: 'Here is what I found.' },
				{ _type: 'message', text: 'inner' },
				{ _type: 'message', text: 'And that is all.' },
			],
		})
	})

	it('handles a still-streaming response where the final action is incomplete', () => {
		const raw = '[ACTION]: {"_type":"createHtml","html":"<div>partial'
		const result = normalizeModelText(raw)
		expect(closeAndParseJson(result)).toEqual({ actions: [{ _type: 'createHtml', html: '<div>partial' }] })
	})

	it('recognizes a line-leading "ACTION:" marker, not just "[ACTION]:"', () => {
		const raw = 'ACTION: {"_type":"message","text":"from a line-leading marker"}'
		const result = normalizeModelText(raw)
		expect(closeAndParseJson(result)).toEqual({
			actions: [{ _type: 'message', text: 'from a line-leading marker' }],
		})
	})
})
