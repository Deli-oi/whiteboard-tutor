import { describe, expect, it } from 'vitest'
import { repairUnescapedLatexBackslashes } from './generate'

describe('repairUnescapedLatexBackslashes', () => {
	it('restores a backspace-corrupted \\b command back to literal text', () => {
		// Simulates the exact confirmed-live corruption: the model wrote
		// "\bar{g}" but didn't double the backslash in its JSON output, so
		// JSON.parse silently interpreted "\b" as a real backspace character
		// (0x08) instead of erroring.
		const corrupted = '$' + String.fromCharCode(0x08) + 'ar{g}$'
		expect(repairUnescapedLatexBackslashes(corrupted)).toBe('$\\bar{g}$')
	})

	it('restores a form-feed-corrupted \\f command back to literal text', () => {
		const corrupted = String.fromCharCode(0x0c) + 'rac{1}{2}'
		expect(repairUnescapedLatexBackslashes(corrupted)).toBe('\\frac{1}{2}')
	})

	it('repairs multiple corrupted commands in the same string', () => {
		const corrupted =
			String.fromCharCode(0x08) + 'ar{g}(x) = ' + String.fromCharCode(0x0c) + 'rac{1}{N}'
		expect(repairUnescapedLatexBackslashes(corrupted)).toBe('\\bar{g}(x) = \\frac{1}{N}')
	})

	it('leaves normal text, including real newlines/tabs, completely untouched', () => {
		const html = '<div>\n\tHello\tworld\n</div>'
		expect(repairUnescapedLatexBackslashes(html)).toBe(html)
	})

	it('leaves correctly-escaped LaTeX (a literal backslash already) untouched', () => {
		const html = '$\\bar{g}(x) = \\frac{1}{N}$'
		expect(repairUnescapedLatexBackslashes(html)).toBe(html)
	})
})
