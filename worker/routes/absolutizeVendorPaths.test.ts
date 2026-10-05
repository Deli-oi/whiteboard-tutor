import { describe, expect, it } from 'vitest'
import { absolutizeVendorPaths } from './absolutizeVendorPaths'

describe('absolutizeVendorPaths', () => {
	it('rewrites a root-relative script src to an absolute URL', () => {
		const html = '<script src="/vendor/chartjs/chart.umd.min.js"></script>'
		expect(absolutizeVendorPaths(html, 'http://localhost:5173')).toBe(
			'<script src="http://localhost:5173/vendor/chartjs/chart.umd.min.js"></script>'
		)
	})

	it('rewrites a stylesheet href too', () => {
		const html = '<link rel="stylesheet" href="/vendor/katex/katex.min.css">'
		expect(absolutizeVendorPaths(html, 'https://example.com')).toBe(
			'<link rel="stylesheet" href="https://example.com/vendor/katex/katex.min.css">'
		)
	})

	it('rewrites multiple references and preserves single quotes', () => {
		const html = `<script src='/vendor/mermaid/mermaid.min.js'></script><script src="/vendor/stepper/stepper.js"></script>`
		const result = absolutizeVendorPaths(html, 'http://localhost:5173')
		expect(result).toContain("src='http://localhost:5173/vendor/mermaid/mermaid.min.js'")
		expect(result).toContain('src="http://localhost:5173/vendor/stepper/stepper.js"')
	})

	it('leaves non-vendor paths and unrelated attributes untouched', () => {
		const html = '<div id="chart" data-foo="/vendor-like/not-real"></div><a href="/other/path">x</a>'
		expect(absolutizeVendorPaths(html, 'http://localhost:5173')).toBe(html)
	})

	it('is a no-op on html with no vendor references', () => {
		const html = '<canvas id="c"></canvas><script>new Chart()</script>'
		expect(absolutizeVendorPaths(html, 'http://localhost:5173')).toBe(html)
	})
})
