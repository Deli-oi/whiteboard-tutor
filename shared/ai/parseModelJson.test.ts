import { describe, expect, it } from 'vitest'
import { parseModelJson } from './parseModelJson'

const action = { actions: [{ _type: 'createHtml', html: '<p>{ braces } in "html"</p>' }] }
const json = JSON.stringify(action)

describe('parseModelJson', () => {
	it('parses a bare JSON reply', () => {
		expect(parseModelJson(json)).toEqual(action)
	})

	it('parses JSON inside a markdown code fence', () => {
		expect(parseModelJson('```json\n' + json + '\n```')).toEqual(action)
	})

	it('ignores prose before and after the object', () => {
		expect(parseModelJson('Here you go:\n' + json + '\nHope this helps.')).toEqual(action)
	})

	it('returns null for a reply with no object', () => {
		expect(parseModelJson('Sorry, I cannot help with that.')).toBeNull()
	})

	it('returns null for invalid or truncated JSON', () => {
		expect(parseModelJson(json.slice(0, -10))).toBeNull()
		expect(parseModelJson('{"actions": [}')).toBeNull()
	})

	it('returns null when the reply has no JSON object, even if it has an array', () => {
		expect(parseModelJson('[1, 2, 3]')).toBeNull()
	})
})
