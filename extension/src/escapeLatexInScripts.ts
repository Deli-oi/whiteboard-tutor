/**
 * LaTeX commands that start with a letter JavaScript reads as a string escape
 * (\n \t \r \b \f \v). Written inside a JS string or template literal -
 * `$\nabla E$` - the browser turns "\n" into a newline and the command
 * silently becomes "<newline>abla". Doubling the backslash is always what the
 * author meant. Whole-word matches only, so a real "\nTotal" is untouched.
 */
const ESCAPE_LIKE_COMMANDS = [
	'nabla', 'neq', 'ne', 'nu', 'not', 'notin', 'ni',
	'theta', 'tau', 'times', 'text', 'textbf', 'top', 'tilde', 'therefore',
	'rho', 'right', 'rightarrow', 'Rightarrow',
	'beta', 'bar', 'begin', 'binom', 'boldsymbol', 'bmod',
	'frac', 'forall',
	'vec', 'varepsilon', 'varphi', 'vartheta', 'vdots', 'vee',
]
const ESCAPE_LIKE_LATEX = new RegExp(`(?<!\\\\)\\\\(?=(?:${ESCAPE_LIKE_COMMANDS.join('|')})(?![A-Za-z]))`, 'g')

const SCRIPT_BLOCK = /(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script>)/gi

/** Doubles the backslash of escape-like LaTeX commands inside inline <script> blocks. */
export function escapeLatexInScripts(html: string): string {
	return html.replace(SCRIPT_BLOCK, (_m, open: string, body: string, close: string) =>
		open + body.replace(ESCAPE_LIKE_LATEX, '\\\\') + close
	)
}
