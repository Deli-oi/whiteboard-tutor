import { parse, serialize } from 'parse5'

/**
 * Phase 1 of the extension pivot (see the approved plan): map a DOM element
 * the user circles in the rendered page back to an exact character range in
 * the real source file, so a later step can splice a generated visualization
 * in at that exact spot.
 *
 * The trick is doing this at serve time, once, instead of guessing at
 * request time: parse the original HTML with parse5's
 * `sourceCodeLocationInfo` (the same mechanism JSDOM uses internally - it
 * gives an exact `[startOffset, endOffset)` character range per element,
 * computed from the ORIGINAL source text), then stamp those offsets onto
 * each element as `data-src-start`/`data-src-end` attributes before the
 * browser ever sees the page. The browser's DOM then carries its own source
 * location - no runtime DOM-to-source matching needed later.
 *
 * These offsets are only ever valid against the original file's text. The
 * file-write step (a later phase) must always re-read the real file fresh
 * from disk and apply the offsets to that text, never to this tagged HTML
 * (which only exists to be served to the browser).
 */
export function tagHtmlWithSourceLocations(html: string): string {
	const document = parse(html, { sourceCodeLocationInfo: true })
	for (const element of walkTaggableElements(document)) {
		const location = element.sourceCodeLocation
		if (!location || !element.attrs) continue
		element.attrs.push(
			{ name: 'data-src-start', value: String(location.startOffset) },
			{ name: 'data-src-end', value: String(location.endOffset) }
		)
	}
	return serialize(document)
}

/** A parse5 element node, typed loosely enough to avoid pulling in its full (large) type surface. */
interface Parse5Element {
	tagName?: string
	attrs?: { name: string; value: string }[]
	childNodes?: Parse5Element[]
	sourceCodeLocation?: { startOffset: number; endOffset: number } | null
}

const SKIP_TAGS = new Set(['html', 'head', 'body', 'script', 'style', 'meta', 'link', 'title'])

/** Every element under `<body>` worth tagging - skips the document skeleton and non-visual tags. */
function* walkTaggableElements(node: Parse5Element): Generator<Parse5Element> {
	if (node.tagName && !SKIP_TAGS.has(node.tagName)) {
		yield node
	}
	for (const child of node.childNodes ?? []) {
		yield* walkTaggableElements(child)
	}
}
