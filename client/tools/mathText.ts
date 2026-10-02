import katex from 'katex'

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

/**
 * Renders a string that may contain inline ($...$) or block ($$...$$) LaTeX
 * math into HTML, escaping everything else as plain text. Templates bake
 * this in statically (via the `katex` npm package, not the runtime
 * auto-render script) since their output is a fixed document, not one that
 * runs its own JS - see CLAUDE.md's "output = interactive HTML" split: these
 * template tools produce static markup, createHtml is the one that needs a
 * live script.
 */
export function renderMathText(text: string): string {
	const pattern = /\$\$([^$]+)\$\$|\$([^$]+)\$/g
	let result = ''
	let lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = pattern.exec(text))) {
		result += escapeHtml(text.slice(lastIndex, match.index))
		const [, blockExpr, inlineExpr] = match
		const expr = blockExpr ?? inlineExpr
		const displayMode = blockExpr !== undefined
		try {
			result += katex.renderToString(expr, { throwOnError: false, displayMode })
		} catch {
			result += escapeHtml(match[0])
		}
		lastIndex = pattern.lastIndex
	}
	result += escapeHtml(text.slice(lastIndex))
	return result
}
