import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inlineVendorAssets } from './inlineVendorAssets'

const ORIGIN = 'http://localhost:5173'

function mockFetch(responses: Record<string, string | ArrayBuffer | null>) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			const path = url.replace(ORIGIN, '')
			const body = responses[path]
			if (body === undefined) throw new Error(`Unexpected fetch: ${path}`)
			if (body === null) return { ok: false } as Response
			if (typeof body === 'string') {
				return { ok: true, text: async () => body } as Response
			}
			return { ok: true, arrayBuffer: async () => body } as Response
		})
	)
}

describe('inlineVendorAssets', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('inlines a vendored script as an inline <script> block', async () => {
		mockFetch({ '/vendor/chartjs/chart.umd.min.js': 'var Chart = {};' })
		const html = '<canvas></canvas><script src="/vendor/chartjs/chart.umd.min.js"></script>'
		const result = await inlineVendorAssets(html, ORIGIN)
		expect(result).toBe('<canvas></canvas><script>var Chart = {};</script>')
	})

	it('inlines a vendored stylesheet as an inline <style> block', async () => {
		mockFetch({ '/vendor/stepper/stepper.css': 'body { color: red; }' })
		const html = '<link rel="stylesheet" href="/vendor/stepper/stepper.css">'
		const result = await inlineVendorAssets(html, ORIGIN)
		expect(result).toBe('<style>body { color: red; }</style>')
	})

	it('points mermaid at the CDN instead of fetching/inlining it', async () => {
		mockFetch({}) // no fetch should happen for mermaid at all
		const html = '<script src="/vendor/mermaid/mermaid.min.js"></script><div class="mermaid">graph TD</div>'
		const result = await inlineVendorAssets(html, ORIGIN)
		expect(result).toContain('src="https://cdn.jsdelivr.net/npm/mermaid@')
		expect(result).not.toContain('/vendor/mermaid/')
	})

	it('rewrites katex.min.css font url()s to base64 data URIs', async () => {
		const fontBytes = new TextEncoder().encode('fake-font-bytes').buffer
		mockFetch({
			'/vendor/katex/katex.min.css': `
				@font-face { src: url(fonts/KaTeX_Main-Regular.woff2) format("woff2"), url(fonts/KaTeX_Main-Regular.woff) format("woff"); }
			`,
			'/vendor/katex/fonts/KaTeX_Main-Regular.woff2': fontBytes,
		})
		const html = '<link rel="stylesheet" href="/vendor/katex/katex.min.css">'
		const result = await inlineVendorAssets(html, ORIGIN)
		expect(result).toContain('url(data:font/woff2;base64,')
		// The unused woff fallback is left alone (harmless - woff2 loads first in Chrome).
		expect(result).toContain('url(fonts/KaTeX_Main-Regular.woff)')
	})

	it('leaves the original tag in place if a fetch fails, rather than producing broken HTML', async () => {
		mockFetch({ '/vendor/chartjs/chart.umd.min.js': null })
		const html = '<script src="/vendor/chartjs/chart.umd.min.js"></script>'
		const result = await inlineVendorAssets(html, ORIGIN)
		expect(result).toBe(html)
	})

	it('is a no-op on html with no vendor references', async () => {
		mockFetch({})
		const html = '<canvas id="c"></canvas><script>new Chart()</script>'
		expect(await inlineVendorAssets(html, ORIGIN)).toBe(html)
	})
})
