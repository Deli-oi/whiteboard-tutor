/**
 * Dev-only accessibility scanning via axe-core (the framework-agnostic
 * engine, not @axe-core/react - that wrapper's own README says it doesn't
 * support React 18+, and this app is on React 19). Logs violations to the
 * console; never runs in production (dynamic import + import.meta.env.DEV
 * both guard against it, so axe-core never ends up in the production
 * bundle).
 *
 * Runs once shortly after initial load rather than on every re-render: this
 * app's canvas re-renders constantly while drawing, and a continuous
 * per-update scan (the pattern @axe-core/react uses) would be noisy and
 * wasteful here. Call `window.runA11yCheck()` from the devtools console to
 * re-scan after navigating the UI (e.g. opening the settings drawer).
 */
export function initDevAccessibilityCheck(): void {
	if (!import.meta.env.DEV) return

	import('axe-core').then((axe) => {
		const run = () => {
			axe
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
		;(window as unknown as { runA11yCheck: () => void }).runA11yCheck = run
	})
}
