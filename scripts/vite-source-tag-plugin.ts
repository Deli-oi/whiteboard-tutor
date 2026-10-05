import type { Plugin } from 'vite'
import { tagHtmlWithSourceLocations } from './sourceLocation'

/**
 * Dev-only: stamps every served element with the exact character range
 * (`data-src-start`/`data-src-end`) it occupies in its real source file, so
 * a browser extension reading those attributes off the live DOM can later
 * splice an edit into the right spot on disk. See sourceLocation.ts for why,
 * and the plan at ancient-rolling-hellman.md for the whole pivot.
 *
 * Deliberately dev-only (mirrors client/devA11y.ts's own dev-only pattern) -
 * this is a developer-tool concern, not something a shipped page needs.
 */
export function sourceTagPlugin(): Plugin {
	return {
		name: 'source-tag-plugin',
		apply: 'serve',
		transformIndexHtml: {
			// Must run before other plugins' transforms (react-refresh's script
			// injection, Vite's own client-script injection, etc.) - those add
			// characters earlier in the document, which would shift every offset
			// after them. 'pre' order is what makes the html this plugin sees
			// match the real file on disk closely enough for offsets to line up.
			order: 'pre',
			handler(html) {
				return tagHtmlWithSourceLocations(html)
			},
		},
	}
}
