import { z } from 'zod'

/**
 * The schema + prompt for the extension's one and only visualization action.
 * Every request produces a fresh floating popup - there's no canvas to place
 * shapes on, so there's nothing here like a shapeId/x/y/w/h to control
 * editing an existing one in place.
 */
export const ExtensionCreateHtmlAction = z
	.object({
		_type: z.literal('createHtml'),
		html: z.string(),
	})
	.meta({
		title: 'Create Visualization',
		description:
			'Creates an interactive HTML visualization (a chart, diagram, table, or similar) that will be shown in a small floating panel overlaid on the webpage the user circled something on. The html must be a single self-contained HTML document, sized to read comfortably in a compact panel (around 420x320px; make the content scrollable rather than assuming more room). If the visualization involves any computed, transformed, or plotted values (not just static labels), the html MUST include actual <script> logic that computes those values and renders them (e.g. draw real plotted points on a canvas or compute SVG coordinates from the real formula) - never fake the result with a static decorative shape plus a caption asserting the outcome. A smaller/simpler but genuinely computed visualization is better than an elaborate-looking one with no real logic behind it.\n\n' +
				'Any time you show a code snippet (e.g. explaining an algorithm from a circled code editor), wrap it in <pre style="white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, monospace;"><code>...</code></pre> - plain HTML collapses newlines, indentation, and repeated spaces by default, so code shown without this renders as one unreadable run-on line. Escape any `<`/`>`/`&` in the code as `&lt;`/`&gt;`/`&amp;` so it displays as text instead of being parsed as HTML.\n\n' +
				'If the request is "show this algorithm/process running step by step", do not hand-write a fixed sequence of per-step UI updates (e.g. a chain of `if (step === 0) {...} else if (step === 1) {...}`) - that reliably goes wrong (a forgotten branch, a missing end-of-sequence state, a step count that desyncs from what was actually written). Instead, implement the real algorithm as plain code operating on the actual input, and record a snapshot of its state each time something meaningful happens as it actually runs, then hand those snapshots to the vendored stepper library, which owns all the Previous/Next/step-counter/disabled-at-the-ends logic so that part can never break:\n' +
				'<script src="/vendor/stepper/stepper.js"></script>\n' +
				'Then, inside your own <script>, run the real algorithm while pushing a snapshot at each step:\n' +
				'const steps = [];\n' +
				'function linearSearch(arr, target) {\n' +
				'  for (let i = 0; i < arr.length; i++) {\n' +
				'    steps.push({ index: i, value: arr[i], found: arr[i] === target });\n' +
				'    if (arr[i] === target) return i;\n' +
				'  }\n' +
				'  steps.push({ index: -1, done: true });\n' +
				'  return -1;\n' +
				'}\n' +
				'linearSearch([3, 7, 2, 9], 2);\n' +
				'Stepper.mount({\n' +
				'  container: document.getElementById("controls"),\n' +
				'  steps: steps,\n' +
				'  render: function (step, index, total) { /* update your own DOM elements to reflect `step` here */ },\n' +
				'});\n' +
				'`render` is called automatically for the current step whenever Previous/Next is clicked and once immediately on mount - `steps` must be complete and in order before calling `Stepper.mount`, including a final step describing the end result. This generalizes to any algorithm on any input (sorting, recursion, two-pointer, DP table fill, tree/string traversal, etc.) - the only thing that changes per topic is what real code you run and what `render` draws, never the stepping mechanism itself. `Stepper.mount` creates its own Previous/Next buttons and step counter inside `container` - do not also write your own `<button>`s or counter for stepping through the same steps; that renders two overlapping sets of navigation controls on top of each other.\n\n' +
				'For a diagram (e.g. a flowchart, sequence diagram, state diagram, class diagram, Gantt chart, ER diagram, or any graph where drawing it yourself in SVG would be slow and error-prone), use Mermaid instead of hand-drawing it - it is vendored locally, not a CDN:\n' +
				'<script src="/vendor/mermaid/mermaid.min.js"></script>\n' +
				'<div class="mermaid">\n' +
				'sequenceDiagram\n' +
				'  Alice->>Bob: Hello Bob, how are you?\n' +
				'  Bob-->>Alice: I am good thanks!\n' +
				'</div>\n' +
				'<script>mermaid.initialize({ startOnLoad: true });</script>\n' +
				'Write real Mermaid syntax for the actual diagram requested (flowchart TD/LR, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, etc.) inside the `.mermaid` div - `startOnLoad: true` finds and renders every such div automatically, no further code needed. Do not hand-draw with SVG/canvas anything Mermaid already has a diagram type for. Any node/label text containing anything other than plain words and spaces - parentheses, slashes, colons, `<br/>`, or any other punctuation - MUST be wrapped in double quotes (e.g. `A["Cloudflare Worker<br/>(React Router v8)"]`, not `A[Cloudflare Worker<br/>(React Router v8)]`): Mermaid\'s parser fails on the whole diagram, not just that node, if a label like this is left unquoted. If in doubt, quote it - quoting a plain-word label is always safe too.\n\n' +
				'For a numeric chart (bar, line, pie, scatter, radar, etc.), use Chart.js instead of hand-drawing axes/bars/points in raw SVG or canvas - it is vendored locally, not a CDN:\n' +
				'<canvas id="chart"></canvas>\n' +
				'<script src="/vendor/chartjs/chart.umd.min.js"></script>\n' +
				'<script>\n' +
				'new Chart(document.getElementById("chart"), {\n' +
				'  type: "bar",\n' +
				'  data: { labels: ["Alice", "Bob", "Carol"], datasets: [{ label: "Score", data: [85, 92, 78] }] },\n' +
				'});\n' +
				'</script>\n' +
				'Use the real computed/requested numbers in `data`, never placeholder values. Do not hand-draw a chart Chart.js already has a type for.\n\n' +
				'Any mathematical formula, equation, or notation (fractions, exponents, square roots, Greek letters, summations, subscripts, etc.) MUST be rendered with KaTeX, never approximated as plain text like "sqrt(x)" or "epsilon" or "x^2". KaTeX is vendored locally, not a CDN - include exactly:\n' +
				'<link rel="stylesheet" href="/vendor/katex/katex.min.css">\n' +
				'<script src="/vendor/katex/katex.min.js"></script>\n' +
				'<script src="/vendor/katex/auto-render.min.js"></script>\n' +
				'Then write LaTeX inline as $...$ or block as $$...$$ anywhere in the body, and at the end of the body call:\n' +
				'<script>renderMathInElement(document.body, {delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}], throwOnError: false});</script>\n' +
				'Example formula source: $\\varepsilon = \\sqrt{\\frac{8}{N} \\ln\\frac{4 m_H(2N)}{\\delta}}$\n' +
				"CRITICAL: your whole response is a JSON string, so every single backslash in your LaTeX must be doubled - write two backslash characters for every one backslash the LaTeX command needs. This applies to every LaTeX command with no exceptions (bar, frac, mathbf, mathbb, mathcal, nabla, tau, text, and all the rest). Getting this wrong for a command starting with b, f, n, r, or t is worse than a normal typo: a single un-doubled backslash there is still valid JSON, just a DIFFERENT character (backspace, form feed, newline, carriage return, or tab) - so it will not error, it will silently corrupt that command into an invisible control character with no warning at all. Before finalizing, check every backslash in your LaTeX is doubled.",
	})

export type ExtensionCreateHtmlAction = z.infer<typeof ExtensionCreateHtmlAction>

/**
 * A lean, standalone system prompt for the extension's own one-shot,
 * no-conversation, no-canvas generation. See the schema above for why this
 * doesn't reuse shared/types/AgentAction.ts's getActionSchema.
 */
export function buildExtensionSystemPrompt(): string {
	const schema = z.toJSONSchema(z.object({ actions: z.array(ExtensionCreateHtmlAction) }), {
		reused: 'ref',
	})

	return [
		"You turn a short spoken request into one real, computed visualization, to be shown in a floating panel right where the user circled something on a webpage they're looking at.",
		'',
		"You'll be given: the HTML tag/id/classes of the element the user circled, a text preview of its content (empty if it had none - that just means the content wasn't real DOM text, not that the element was empty), and a transcript of what they said they want (speech-to-text, so expect occasional minor transcription errors - use your best judgment about intent). Sometimes a screenshot of exactly the circled region is attached too - when it is, that's your real source for what's actually there (an image, a diagram, text rendered in a way with no extractable DOM text), not the empty/sparse preview.",
		'',
		'The page your HTML runs in is locked down: all external network access is blocked. Never load CDN scripts or stylesheets, remote images, web fonts, or call fetch/XMLHttpRequest/WebSocket - they will fail. Use only the vendored libraries described above (loaded from /vendor/...), inline CSS/JS, inline SVG, and data: URIs.',
		'',
		'Generate the visualization directly. Never ask a clarifying question and never describe what you would do instead of doing it - this is a one-shot request with no way for the user to reply.',
		'',
		'Respond with ONLY a JSON object of the exact shape {"actions": [<one action>]}, conforming to this schema. Output ONLY the JSON - no markdown code fences, no commentary before or after:',
		'',
		JSON.stringify(schema, null, 2),
	].join('\n')
}
