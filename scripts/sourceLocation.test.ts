import { parse } from 'parse5'
import { describe, expect, it } from 'vitest'
import { tagHtmlWithSourceLocations } from './sourceLocation'

/** Extracts the data-src-start/end pair for the first element matching `tag`. */
function locationOf(html: string, tag: string): { start: number; end: number } | null {
	const match = html.match(
		new RegExp(`<${tag}\\b[^>]*data-src-start="(\\d+)"[^>]*data-src-end="(\\d+)"`)
	)
	return match ? { start: Number(match[1]), end: Number(match[2]) } : null
}

describe('tagHtmlWithSourceLocations', () => {
	it('tags an element with the exact character range of the original source', () => {
		const original = '<!doctype html><html><body><div id="a"><p>Hello</p></div></body></html>'
		const tagged = tagHtmlWithSourceLocations(original)

		const div = locationOf(tagged, 'div')
		expect(div).not.toBeNull()
		// The stamped range must point back at the ORIGINAL (untagged) source.
		expect(original.slice(div!.start, div!.end)).toBe('<div id="a"><p>Hello</p></div>')
	})

	it('tags nested elements independently, each pointing at its own extent', () => {
		const original = '<!doctype html><html><body><div><p>Hello <b>world</b></p></div></body></html>'
		const tagged = tagHtmlWithSourceLocations(original)

		const p = locationOf(tagged, 'p')
		const b = locationOf(tagged, 'b')
		expect(original.slice(p!.start, p!.end)).toBe('<p>Hello <b>world</b></p>')
		expect(original.slice(b!.start, b!.end)).toBe('<b>world</b>')
	})

	it('skips structural and non-visual tags', () => {
		const original =
			'<!doctype html><html><head><title>t</title><style>a{}</style></head><body><script>1</script><div>x</div></body></html>'
		const tagged = tagHtmlWithSourceLocations(original)

		expect(locationOf(tagged, 'html')).toBeNull()
		expect(locationOf(tagged, 'head')).toBeNull()
		expect(locationOf(tagged, 'body')).toBeNull()
		expect(locationOf(tagged, 'title')).toBeNull()
		expect(locationOf(tagged, 'style')).toBeNull()
		expect(locationOf(tagged, 'script')).toBeNull()
		expect(locationOf(tagged, 'div')).not.toBeNull()
	})

	it('tags void elements too', () => {
		const original = '<!doctype html><html><body><img src="a.png"></body></html>'
		const tagged = tagHtmlWithSourceLocations(original)

		const img = locationOf(tagged, 'img')
		expect(img).not.toBeNull()
		expect(original.slice(img!.start, img!.end)).toBe('<img src="a.png">')
	})

	it('produces output that still parses as valid HTML', () => {
		const original = '<!doctype html><html><body><div class="x">hi</div></body></html>'
		const tagged = tagHtmlWithSourceLocations(original)
		expect(() => parse(tagged)).not.toThrow()
		expect(tagged).toContain('data-src-start')
	})
})
