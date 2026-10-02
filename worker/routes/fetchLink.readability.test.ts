import { describe, expect, it } from 'vitest'
import { extractReadableText } from './fetchLink'

describe('extractReadableText', () => {
	it('extracts a real article, stripping nav/footer/script noise that a plain tag-strip keeps', () => {
		const html = `<!doctype html>
<html>
<head><title>A Real Article</title></head>
<body>
	<nav><a href="/">Home</a><a href="/about">About</a></nav>
	<script>trackPageView();</script>
	<article>
		<h1>A Real Article</h1>
		<p>${'This is a substantial paragraph of real article content that Readability should recognize as the main body text of the page, long enough to clear its content-length heuristics. '.repeat(3)}</p>
		<p>${'A second paragraph with more real content, also padded out so Readability treats this page as reader-able rather than too short to bother with. '.repeat(3)}</p>
	</article>
	<footer>Copyright 2026. All rights reserved. Contact us. Privacy policy.</footer>
</body>
</html>`

		const result = extractReadableText(html)
		expect(result.title).toBe('A Real Article')
		expect(result.text).toContain('substantial paragraph of real article content')
		expect(result.text).not.toContain('trackPageView')
		expect(result.text).not.toContain('Privacy policy')
	})

	it('falls back to a plain tag strip for a non-article page Readability rejects', () => {
		const html = `<!doctype html><html><head><title>Links</title></head><body><ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></body></html>`
		const result = extractReadableText(html)
		expect(result.title).toBe('Links')
		expect(result.text).toContain('A')
	})

	it('never throws on malformed HTML', () => {
		expect(() => extractReadableText('<html><body><p>unclosed')).not.toThrow()
	})
})
