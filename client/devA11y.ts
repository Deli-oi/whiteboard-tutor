/**
 * Dev-only accessibility scanning via axe-core (the framework-agnostic
 * engine, not @axe-core/react - that wrapper's own README says it doesn't
 * support React 18+, and this app is on React 19). Logs violations to the
 * console; never runs in production - the `import.meta.env.DEV` guard means
 * the script tag is never injected outside dev mode.
 *
 * Loaded via a vendored static file + <script> tag (same pattern as
 * KaTeX/Mermaid/Chart.js) rather than a bare `import('axe-core')`: a plain
 * ESM import goes through Vite's dependency pre-bundler, which stalled with
 * a 504 for this package in local testing - script injection sidesteps that
 * pipeline entirely, and this file never ships to production either way.
 *
 * Runs once shortly after initial load rather than on every re-render: this
 * app's canvas re-renders constantly while drawing, and a continuous
 * per-update scan (the pattern @axe-core/react uses) would be noisy and
 * wasteful here. Call `window.runA11yCheck()` from the devtools console to
 * re-scan after navigating the UI (e.g. opening the settings drawer).
 */

interface AxeResults {
	violations: {
		id: string
		impact?: string
		help: string
		nodes: { target: string[] }[]
	}[]
}

declare global {
	interface Window {
		axe?: { run: () => Promise<AxeResults> }
		runA11yCheck?: () => void
	}
}

export function initDevAccessibilityCheck(): void {
	if (!import.meta.env.DEV) return

	const script = document.createElement('script')
	script.src = '/vendor/axe-core/axe.min.js'
	script.onload = () => {
		const run = () => {
			if (!window.axe) {
				console.error('[a11y] axe-core failed to load')
				return
			}
			window.axe
				.run()
				.then((results) => {
					if (results.violations.length === 0) {
						console.log('[a11y] No violations found.')
						return
					}
					console.warn(`[a11y] ${results.violations.length} accessibility violation(s):`)
					for (const violation of results.violations) {
						console.warn(
							`[a11y] ${violation.id} (${violation.impact}): ${violation.help} - ${violation.nodes.length} element(s)`,
							violation.nodes.map((n) => n.target)
						)
					}
				})
				.catch((e) => console.error('[a11y] axe-core scan failed:', e))
		}
		setTimeout(run, 2000)
		window.runA11yCheck = run
	}
	script.onerror = () => console.error('[a11y] Failed to load /vendor/axe-core/axe.min.js')
	document.head.appendChild(script)
}
