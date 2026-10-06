import { describe, expect, it } from 'vitest'
import { isSuspiciouslyThin, repairUnescapedLatexBackslashes } from './generate'

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

describe('isSuspiciouslyThin', () => {
	it('flags a genuinely near-empty response', () => {
		expect(isSuspiciouslyThin('<div></div>')).toBe(true)
		expect(isSuspiciouslyThin('N/A')).toBe(true)
		expect(isSuspiciouslyThin('')).toBe(true)
	})

	it('does not flag a real, if short, visualization', () => {
		const realButShort =
			'<div style="padding:10px;font-family:sans-serif;">Two Sum uses a hash map to find the pair in one pass.</div>'
		expect(isSuspiciouslyThin(realButShort)).toBe(false)
	})

	it('does not flag a full vendored-library visualization', () => {
		const real =
			'<canvas id="c"></canvas><script src="/vendor/chartjs/chart.umd.min.js"></script>' +
			'<script>new Chart(document.getElementById("c"),{type:"bar",data:{labels:["A"],datasets:[{data:[1]}]}});</script>'
		expect(isSuspiciouslyThin(real)).toBe(false)
	})

	it('only counts trimmed content, not surrounding whitespace', () => {
		expect(isSuspiciouslyThin('   \n\n  <div></div>  \n  ')).toBe(true)
	})
})
