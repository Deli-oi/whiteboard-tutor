import { IRequest } from 'itty-router'
import { getFragment } from './fragmentCache'

/**
 * Serves a generated visualization as a real HTML document at its own URL,
 * meant to be loaded via `<iframe src>` rather than `srcdoc`.
 *
 * Why this route exists at all: confirmed live that a `srcdoc` (or `data:`)
 * iframe inherits the Content-Security-Policy of whatever page embeds it -
 * standard, spec-defined behavior for "local scheme" documents, not a bug.
 * On a site with a strict CSP (GitHub, confirmed live - script tags loaded
 * fine, but no script of any kind, inline or external, ever executed), that
 * silently breaks every generated visualization, since they're all
 * script-driven (Chart.js, Mermaid, computed KaTeX, Stepper). A real,
 * separate-origin document has its own CSP (none, here), independent of the
 * embedding page's - this is the only way to escape that inheritance.
 *
 * No X-Frame-Options or frame-ancestors is set, on purpose: this document's
 * entire purpose is to be framed by an arbitrary page.
 */
export async function renderFragment(request: IRequest) {
	const id = request.params.id
	const html = id ? getFragment(id) : null
	if (!html) {
		return new Response('This visualization has expired. Circle it again to regenerate it.', {
			status: 404,
		})
	}
	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	})
}
