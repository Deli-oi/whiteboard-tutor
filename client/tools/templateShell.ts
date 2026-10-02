import { HTML_SHAPE_FRAME } from '../shapes/htmlShapeConstants'

/**
 * The iframe's actual rendered pixel size (its body is 100% of this) is
 * `w/h` minus the HtmlShapeUtil frame on each side - templates must size
 * their content to this, not the raw shape `w`/`h`, or content overflows
 * and triggers scrollbars.
 */
export function contentSize(w: number, h: number): { w: number; h: number } {
	return { w: w - HTML_SHAPE_FRAME * 2, h: h - HTML_SHAPE_FRAME * 2 }
}

/**
 * Wraps a template's body markup into a complete, self-contained HTML
 * document for the `html` shape's srcDoc. Unlike createHtml (which lets the
 * model write arbitrary scripted documents), every template tool's output is
 * static markup computed up front - the KaTeX stylesheet link is the only
 * external reference, and it resolves fine from inside the sandboxed iframe
 * (verified with createHtml's own KaTeX support).
 */
export function wrapTemplateHtml(bodyHtml: string, extraStyles = ''): string {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/vendor/katex/katex.min.css">
<style>
	* { box-sizing: border-box; }
	html, body {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
		color: #1a1a1a;
		overflow: auto;
	}
	.tool-title {
		font-size: 15px;
		font-weight: 600;
		margin: 0 0 12px 0;
	}
	${extraStyles}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}
