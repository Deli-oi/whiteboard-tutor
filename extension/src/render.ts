/**
 * This page is declared under manifest.json's `sandbox.pages`, which gives
 * it a unique opaque origin and (unlike every other extension page) a
 * default CSP that allows inline scripts/eval - the documented Chrome
 * pattern for running untrusted/dynamic HTML inside an extension. That's
 * required here: the model's generated HTML is full of inline <script>
 * blocks (Chart.js setup, computed values, Stepper calls), which the
 * extension's normal `script-src 'self'` page CSP would silently block
 * entirely - confirmed from Chrome's own MV3 CSP docs, not guessed.
 *
 * Being a sandboxed page also means it's loaded from `chrome-extension://`,
 * not `srcdoc`/`data:`, so it does NOT inherit the embedding (visited)
 * page's CSP the way a plain srcdoc iframe would - confirmed live that a
 * strict-CSP site (GitHub) silently blocks all script execution, inline or
 * external, inside a srcdoc iframe, with the HTML still rendering but
 * nothing ever running.
 *
 * Sandboxed pages have no access to chrome.* APIs (by design - this is the
 * security boundary around untrusted generated code), so the HTML payload
 * can't be read from chrome.storage here. It arrives via postMessage from
 * the content script that created this iframe instead.
 */
/**
 * Forwards hold-V to the parent content script. Keydown/keyup events are
 * scoped to whichever document currently has focus and never cross a frame
 * boundary on their own - once the user clicks anything inside the generated
 * visualization (a chart, a button), focus moves into THIS document, and the
 * parent page's own keydown listener stops seeing V entirely. Capturing it
 * here too and relaying it closes that gap (confirmed bug report: hold-V
 * "only works if you don't click anything in between").
 */
function attachKeyForwarding() {
	document.addEventListener('keydown', (e) => {
		if (e.key.toLowerCase() !== 'v') return
		const active = document.activeElement
		const isTyping =
			active instanceof HTMLInputElement ||
			active instanceof HTMLTextAreaElement ||
			(active instanceof HTMLElement && active.isContentEditable)
		if (isTyping) return
		window.parent.postMessage({ type: 'iterate-key-down' }, '*')
	})
	document.addEventListener('keyup', (e) => {
		if (e.key.toLowerCase() !== 'v') return
		window.parent.postMessage({ type: 'iterate-key-up' }, '*')
	})
}

/**
 * Forwards any error the model's generated script throws - uncaught
 * exceptions and rejected promises alike - to the parent content script,
 * which attaches the latest few to a bug report if the user flags this
 * result. Without this, a crashing visualization just fails silently in a
 * sandboxed iframe no one's watching the console of.
 */
function attachErrorForwarding() {
	window.addEventListener('error', (e) => {
		window.parent.postMessage({ type: 'runtime-error', message: e.message }, '*')
	})
	window.addEventListener('unhandledrejection', (e) => {
		window.parent.postMessage({ type: 'runtime-error', message: `Unhandled rejection: ${e.reason}` }, '*')
	})
}

const DELIMITED_MATH = /\$\$[\s\S]+?\$\$|\\\(|\\\[/
const INLINE_DOLLAR = /(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g
const NO_MATH_TAGS = /^(SCRIPT|STYLE|TEXTAREA|PRE|CODE|OPTION|NOSCRIPT)$/

/**
 * Whether the inside of a $...$ pair is math rather than two prices in a
 * sentence ("costs $5 and $10" pairs up as "5 and "). Real inline TeX never
 * has whitespace just inside the dollars, and starts with a letter ($n$,
 * $O(n)$) or contains TeX syntax ($2^n$, $\log n$).
 */
function isInlineMath(inner: string): boolean {
	if (/^\s|\s$/.test(inner)) return false
	return /[\\^_{}=]/.test(inner) || /^[A-Za-z]/.test(inner)
}

/**
 * Rewrites inline $...$ math to \(...\) in place, so KaTeX's own `$`
 * delimiter (which pairs ANY two dollar signs) is never used. Returns whether
 * anything was rewritten.
 */
function convertInlineDollarMath(root: Element): boolean {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
				if (
					NO_MATH_TAGS.test(el.tagName) ||
					el.classList.contains('katex') ||
					el.classList.contains('mermaid') ||
					el instanceof SVGElement
				)
					return NodeFilter.FILTER_REJECT
			}
			return (node as Text).data.includes('$') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
		},
	})
	let changed = false
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		const next = node.data.replace(INLINE_DOLLAR, (match, inner: string) =>
			isInlineMath(inner) ? '\\(' + inner + '\\)' : match
		)
		if (next !== node.data) {
			node.data = next
			changed = true
		}
	}
	return changed
}

type MathWindow = Window & { katex?: unknown; renderMathInElement?: (el: Element, options: object) => void }
const mathWindow = window as MathWindow

let katexLoading: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script')
		script.src = src
		script.onload = () => resolve()
		script.onerror = () => reject(new Error(`Failed to load ${src}`))
		document.head.appendChild(script)
	})
}

function loadKatex(): Promise<void> {
	if (mathWindow.renderMathInElement) return Promise.resolve()
	katexLoading ??= (async () => {
		const link = document.createElement('link')
		link.rel = 'stylesheet'
		link.href = '/vendor/katex/katex.min.css'
		document.head.appendChild(link)
		if (!mathWindow.katex) await loadScript('/vendor/katex/katex.min.js')
		await loadScript('/vendor/katex/auto-render.min.js')
	})()
	return katexLoading
}

function renderMathIfPresent() {
	if (!document.body) return
	const converted = convertInlineDollarMath(document.body)
	if (!converted && !DELIMITED_MATH.test(document.body.innerText)) return
	loadKatex()
		.then(() =>
			mathWindow.renderMathInElement?.(document.body, {
				delimiters: [
					{ left: '$$', right: '$$', display: true },
					{ left: '\\[', right: '\\]', display: true },
					{ left: '\\(', right: '\\)', display: false },
				],
				throwOnError: false,
				ignoredClasses: ['mermaid'],
			})
		)
		.catch((e) => {
			window.parent.postMessage({ type: 'runtime-error', message: String(e) }, '*')
		})
}

/**
 * Safety net for math the model wrote but never rendered: the prompt says to
 * include KaTeX, but a beta report showed "$O(n^2)$" with no KaTeX loaded,
 * which displays as raw dollar signs. Loads the vendored KaTeX on demand and
 * renders - once the page has loaded, and again whenever the DOM changes
 * (stepper steps and other render functions add math after load). Rendering
 * consumes the delimiters, so a re-check after its own mutations finds
 * nothing and stops.
 */
function attachMathSafetyNet() {
	if (document.readyState === 'complete') renderMathIfPresent()
	else window.addEventListener('load', renderMathIfPresent)

	let timer: ReturnType<typeof setTimeout> | null = null
	new MutationObserver(() => {
		if (timer) clearTimeout(timer)
		timer = setTimeout(renderMathIfPresent, 50)
	}).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
}

function hasVisibleBox(style: CSSStyleDeclaration): boolean {
	const background = style.backgroundColor
	return (
		(background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') ||
		parseFloat(style.borderTopWidth) > 0 ||
		parseFloat(style.borderRightWidth) > 0 ||
		style.boxShadow !== 'none'
	)
}

/**
 * Keeps text inside the boxes it's drawn in. Generated layouts often put
 * something unbreakable (a KaTeX fraction, a long label) in a narrow column,
 * and it spills past the card's edge (confirmed from a beta screenshot).
 * Any visible box (background, border, or shadow) whose content overflows it
 * grows to cover that content - the page needing to scroll is fine, text
 * outside its box isn't. Children are handled before parents, so a box that
 * grows can in turn make its enclosing box grow. Unboxed overflow is left
 * alone; the page itself scrolls.
 */
function containOverflowingContent() {
	if (!document.body) return
	const elements = Array.from(document.body.querySelectorAll('*')).slice(0, 3000).reverse()
	for (const el of elements) {
		if (!(el instanceof HTMLElement) || el.closest('.katex, .mermaid')) continue
		const overflowsX = el.scrollWidth > el.clientWidth + 1
		const overflowsY = el.scrollHeight > el.clientHeight + 1
		if (!overflowsX && !overflowsY) continue
		const style = getComputedStyle(el)
		if (style.display === 'inline' || style.display === 'contents') continue
		if (style.overflowX !== 'visible' || style.overflowY !== 'visible') continue
		if (!hasVisibleBox(style)) continue
		// scrollWidth/Height include padding but not borders.
		const borderBox = style.boxSizing === 'border-box'
		if (overflowsX) {
			const extra = borderBox
				? parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
				: -(parseFloat(style.paddingLeft) + parseFloat(style.paddingRight))
			el.style.minWidth = `${el.scrollWidth + extra}px`
			el.style.flexShrink = '0'
		}
		if (overflowsY) {
			const extra = borderBox
				? parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
				: -(parseFloat(style.paddingTop) + parseFloat(style.paddingBottom))
			el.style.minHeight = `${el.scrollHeight + extra}px`
		}
	}
}

function attachLayoutCheck() {
	let timer: ReturnType<typeof setTimeout> | null = null
	const schedule = () => {
		if (timer) clearTimeout(timer)
		timer = setTimeout(containOverflowingContent, 150)
	}
	if (document.readyState === 'complete') schedule()
	else window.addEventListener('load', schedule)
	// KaTeX's fonts load lazily after its first render and widen the math.
	void document.fonts?.ready.then(schedule)
	document.fonts?.addEventListener('loadingdone', schedule)
	new MutationObserver(schedule).observe(document.documentElement, {
		childList: true,
		subtree: true,
		characterData: true,
	})
}

const MERMAID_BLOCK = /(<(div|pre)\b[^>]*\bclass\s*=\s*["'][^"']*\bmermaid\b[^"']*["'][^>]*>)([\s\S]*?)(<\/\2>)/gi

/**
 * Deterministic fixes for the two Mermaid failures beta reports keep showing,
 * applied to the HTML string before it's written (so there's no race with
 * Mermaid or KaTeX at runtime):
 * - $...$ math inside a diagram. Mermaid can't render it, and the page's
 *   KaTeX pass rewrites it into HTML before Mermaid parses, corrupting the
 *   whole diagram. The delimiters are dropped; the TeX stays as plain text.
 * - Unquoted flowchart labels containing parentheses or other punctuation,
 *   e.g. G1[Model g(x)] or Avg((Avg g(x))). Quoting a label is always valid.
 */
const TEX_ACCENTS: Record<string, string> = { bar: '̄', overline: '̄', hat: '̂', tilde: '̃', vec: '⃗' }
const TEX_NAMES: Record<string, string> = {
	alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', theta: 'θ', lambda: 'λ',
	mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω',
	leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', times: '×', cdot: '·', infty: '∞',
	to: '→', rightarrow: '→', approx: '≈', in: '∈', sum: 'Σ', ldots: '…', dots: '…',
}
const SUBSCRIPT: Record<string, string> = Object.fromEntries(
	[...'0123456789+-()aeijknoxt'].map((c, i) => [c, '₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₐₑᵢⱼₖₙₒₓₜ'[i]])
)
const SUPERSCRIPT: Record<string, string> = Object.fromEntries(
	[...'0123456789+-()niT'].map((c, i) => [c, '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿⁱᵀ'[i]])
)

/** Readable plain text for TeX inside a diagram label: \bar{g}_1 -> ḡ₁, g^{(1)} -> g⁽¹⁾. */
function texToPlain(tex: string): string {
	return tex
		.replace(/\\(bar|overline|hat|tilde|vec)\{([^{}])\}/g, (_m, cmd: string, c: string) => c + TEX_ACCENTS[cmd])
		.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
		.replace(/\\([A-Za-z]+)/g, (_m, name: string) => TEX_NAMES[name] ?? name)
		.replace(/([_^])(?:\{([^{}]*)\}|(.))/g, (m, op: string, group: string | undefined, ch: string | undefined) => {
			const body = group ?? ch ?? ''
			const map = op === '_' ? SUBSCRIPT : SUPERSCRIPT
			return [...body].every((c) => map[c]) ? [...body].map((c) => map[c]).join('') : m
		})
		.replace(/[{}]/g, '')
}

function fixMermaidSource(src: string): string {
	const withoutMath = src
		.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => texToPlain(inner))
		.replace(INLINE_DOLLAR, (match, inner: string) => (isInlineMath(inner) ? texToPlain(inner) : match))
	if (!/^\s*(graph|flowchart)\b/.test(withoutMath)) return withoutMath
	return withoutMath
		.split('\n')
		.map((line) =>
			line
				.replace(/([A-Za-z0-9_-]+)\[(?![[\]"(/\\])([^[\]"\n]+?)\](?!\])/g, '$1["$2"]')
				.replace(/([A-Za-z0-9_-]+)\(\((?!")(.+?)\)\)(?=\s*(?:$|-|=|&|;|:::))/g, '$1(("$2"))')
		)
		.join('\n')
}

function decodeHtmlText(html: string): string {
	const textarea = document.createElement('textarea')
	textarea.innerHTML = html
	return textarea.value
}

type MermaidApi = {
	parse: (text: string) => Promise<unknown>
	initialize: (config: object) => void
	run: () => Promise<void>
}

/**
 * Parses every diagram with Mermaid's own parser and reports the first
 * failure to the content script, which asks the model for one automatic
 * repair with the exact error. Also loads Mermaid if the model wrote a
 * `.mermaid` block but forgot the script tag (it would otherwise show the
 * raw source as text).
 */
function validateMermaid(sources: string[]) {
	if (!sources.length) return
	const started = Date.now()
	let loadedOurselves = false
	const check = () => {
		const mermaid = (window as Window & { mermaid?: MermaidApi }).mermaid
		if (!mermaid?.parse) {
			if (document.readyState === 'complete' && !loadedOurselves) {
				loadedOurselves = true
				loadScript('/vendor/mermaid/mermaid.min.js')
					.then(() => {
						const m = (window as Window & { mermaid?: MermaidApi }).mermaid
						m?.initialize({ startOnLoad: false })
						return m?.run()
					})
					.catch((e) => window.parent.postMessage({ type: 'runtime-error', message: String(e) }, '*'))
			}
			if (Date.now() - started < 8000) setTimeout(check, 100)
			return
		}
		void (async () => {
			for (const source of sources) {
				try {
					await mermaid.parse(decodeHtmlText(source))
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e)
					window.parent.postMessage({ type: 'mermaid-error', message }, '*')
					return
				}
			}
		})()
	}
	check()
}

window.addEventListener('message', (event) => {
	const raw = (event.data as { html?: string } | undefined)?.html
	if (typeof raw !== 'string') return

	// document.write() needs a real `<!DOCTYPE html>` as the literal first
	// thing written, or the resulting document renders in quirks mode -
	// confirmed live (KaTeX refuses to run at all in quirks mode, logging
	// "KaTeX doesn't work in quirks mode. Make sure your website has a
	// suitable doctype." - silently breaking the whole visualization, not
	// just the math). The model isn't reliably told to include one, so this
	// strips whatever doctype (if any) it wrote and supplies a known-good one
	// itself rather than depending on the model's compliance.
	const mermaidSources: string[] = []
	const html = raw
		.replace(/^\s*<!doctype[^>]*>/i, '')
		.trimStart()
		.replace(MERMAID_BLOCK, (_match, open: string, _tag: string, body: string, close: string) => {
			const fixed = fixMermaidSource(body)
			mermaidSources.push(fixed)
			return open + fixed + close
		})

	document.open()
	document.write('<!DOCTYPE html>\n' + html)
	document.close()

	// document.open() tears down and rebuilds the document, including
	// whatever was listening on it - both forwarders have to run again after
	// the write, not just once at module load, or they never actually attach
	// to anything. The content script navigates this iframe fresh for every
	// render (initial and every hold-V iteration alike - see
	// content-script.ts's loadVisualization()), so this handler only ever
	// runs once per page instance in practice, but it's written to not
	// depend on that.
	attachKeyForwarding()
	attachErrorForwarding()
	attachMathSafetyNet()
	validateMermaid(mermaidSources)
	attachLayoutCheck()
})
