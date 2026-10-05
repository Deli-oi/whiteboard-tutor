const VENDOR_PATH_PATTERN = /((?:src|href)=["'])(\/vendor\/[^"']*)(["'])/g

/**
 * Rewrites root-relative /vendor/... references in generated HTML to
 * absolute URLs against `origin`.
 *
 * createHtml's generated HTML references vendored libraries (Chart.js,
 * Mermaid, KaTeX, Stepper) as root-relative paths like
 * `/vendor/chartjs/chart.umd.min.js` - correct when it renders in a
 * same-origin iframe shape on the tldraw canvas (shared/schema/
 * AgentActionSchemas.ts's instructions were written for that case), but a
 * `srcdoc` iframe resolves relative/root-relative URLs against the
 * EMBEDDING page's origin, not the worker's. Confirmed live: on any page
 * other than the worker's own, every vendored script 404s silently,
 * leaving whatever canvas/div the broken script never finished drawing
 * into (reported live as a plain black box - Chart.js never loaded to
 * paint over the canvas's default fill).
 */
export function absolutizeVendorPaths(html: string, origin: string): string {
	return html.replace(VENDOR_PATH_PATTERN, (_match, prefix, path, suffix) => `${prefix}${origin}${path}${suffix}`)
}
