/**
 * Makes createHtml's generated visualizations work regardless of where the
 * embedding page lives - not just dev-server pages, and not just HTTP
 * pages. Two problems, found live, chained:
 *
 * 1. A `srcdoc` iframe resolves a root-relative `/vendor/...` reference
 *    against the EMBEDDING page's origin, not the worker's - so the old
 *    absolutizeVendorPaths.ts fix (rewriting to the worker's real origin)
 *    was a real, necessary step, but not sufficient on its own.
 * 2. Nearly every real website is HTTPS, and browsers categorically block
 *    an HTTPS page from loading ANY `http://` subresource - confirmed live
 *    via network inspection (zero request even attempted). Since this
 *    project's dev server is plain HTTP, every vendored script still
 *    silently failed even with the correct origin.
 *
 * Fix, chosen for the stated long-term goal (shareable with other people,
 * not dependent on the original builder's own machine being reachable):
 * inline the small libraries' actual source directly into the HTML - no
 * external request of any kind, works no matter where the worker lives or
 * whether it's even reachable from the visited page's protocol. Mermaid
 * alone (~5.5MB) goes through a public HTTPS CDN instead, since inlining
 * that on every response would cost more latency than a browser-cacheable
 * CDN reference - a scoped, deliberate exception to "vendor everything
 * locally," limited to this one library.
 */

// jsdelivr is npm-backed (serves any published version directly from the
// registry), unlike cdnjs's curated mirror which 404'd on this exact
// version - confirmed live. Version must match public/vendor/mermaid/
// mermaid.min.js (currently 12.1.0, read from its own embedded version
// string) so the syntax createHtml is instructed to write stays compatible.
const MERMAID_CDN_URL = 'https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.min.js'

/** Matches `<script src="/vendor/...">` and `<link ... href="/vendor/...">` tags, capturing the path and the whole tag. */
const VENDOR_TAG_PATTERN =
	/<script\b[^>]*\bsrc=["'](\/vendor\/[^"']+)["'][^>]*>\s*<\/script>|<link\b[^>]*\bhref=["'](\/vendor\/[^"']+)["'][^>]*>/g

async function fetchText(origin: string, path: string): Promise<string | null> {
	try {
		const res = await fetch(origin + path)
		if (!res.ok) return null
		return await res.text()
	} catch {
		return null
	}
}

async function fetchBase64(origin: string, path: string): Promise<string | null> {
	try {
		const res = await fetch(origin + path)
		if (!res.ok) return null
		const buf = new Uint8Array(await res.arrayBuffer())
		let binary = ''
		const CHUNK = 8192
		for (let i = 0; i < buf.length; i += CHUNK) {
			binary += String.fromCharCode(...buf.subarray(i, i + CHUNK))
		}
		return btoa(binary)
	} catch {
		return null
	}
}

/**
 * katex.min.css references its web fonts as relative `url(fonts/*.woff2)`
 * paths - correct when the stylesheet is linked normally, broken once
 * inlined into a `<style>` block with no "file location" to resolve
 * relative to (it'd fall back to the embedding page's origin, the exact
 * problem this whole fix exists to avoid). This repo only targets Chrome
 * (it's a Chrome extension), so only the woff2 variant - the one Chrome
 * actually uses - needs a working reference; the woff/ttf fallback entries
 * in the same @font-face rule are harmless left as-is, since a browser
 * never reaches them once an earlier src in the same rule loads.
 */
async function inlineKatexFonts(css: string, origin: string): Promise<string> {
	const fontUrlPattern = /url\((fonts\/[^)'"]+\.woff2)\)/g
	const matches = [...css.matchAll(fontUrlPattern)]
	const uniquePaths = [...new Set(matches.map((m) => m[1]))]

	const replacements = new Map<string, string>()
	await Promise.all(
		uniquePaths.map(async (relPath) => {
			const base64 = await fetchBase64(origin, '/vendor/katex/' + relPath)
			if (base64) replacements.set(relPath, `data:font/woff2;base64,${base64}`)
		})
	)

	return css.replace(fontUrlPattern, (match, relPath: string) => {
		const dataUri = replacements.get(relPath)
		return dataUri ? `url(${dataUri})` : match
	})
}

export async function inlineVendorAssets(html: string, origin: string): Promise<string> {
	const matches = [...html.matchAll(VENDOR_TAG_PATTERN)]
	if (matches.length === 0) return html

	let result = html
	for (const match of matches) {
		const [fullTag, scriptPath, linkPath] = match
		const path = scriptPath ?? linkPath

		if (path.startsWith('/vendor/mermaid/')) {
			result = result.replace(fullTag, `<script src="${MERMAID_CDN_URL}"></script>`)
			continue
		}

		if (path.endsWith('.css')) {
			const css = await fetchText(origin, path)
			if (!css) continue // leave the original tag - better a missing stylesheet than broken HTML
			const inlined = path.includes('/katex/') ? await inlineKatexFonts(css, origin) : css
			result = result.replace(fullTag, `<style>${inlined}</style>`)
			continue
		}

		const js = await fetchText(origin, path)
		if (!js) continue
		result = result.replace(fullTag, `<script>${js}</script>`)
	}

	return result
}
