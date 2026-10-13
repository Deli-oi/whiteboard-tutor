import { describe, expect, it } from 'vitest'
import { escapeLatexInScripts } from './escapeLatexInScripts'

describe('escapeLatexInScripts', () => {
	it('doubles the backslash of a LaTeX command inside a script template literal', () => {
		const html = '<script>el.innerHTML = `$\\nabla E = ${v}$`</script>'
		expect(escapeLatexInScripts(html)).toBe('<script>el.innerHTML = `$\\\\nabla E = ${v}$`</script>')
	})

	it('handles several commands, including \\theta, \\frac and \\bar', () => {
		const out = escapeLatexInScripts('<script>s = "\\theta \\frac{1}{2} \\bar{g}"</script>')
		expect(out).toBe('<script>s = "\\\\theta \\\\frac{1}{2} \\\\bar{g}"</script>')
	})

	it('leaves already-doubled backslashes alone', () => {
		const html = '<script>s = "\\\\nabla"</script>'
		expect(escapeLatexInScripts(html)).toBe(html)
	})

	it('leaves ordinary newline/tab escapes alone', () => {
		const html = '<script>s = "line1\\nTotal\\tdone\\nnext"</script>'
		expect(escapeLatexInScripts(html)).toBe(html)
	})

	it('does not touch HTML outside scripts', () => {
		const html = '<p>\\nabla</p><script src="/vendor/x.js"></script>'
		expect(escapeLatexInScripts(html)).toBe(html)
	})
})
