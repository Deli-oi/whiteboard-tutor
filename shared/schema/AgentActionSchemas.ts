import z from 'zod'
import { FocusedColor } from '../format/FocusedColor'
import { FocusedFillSchema } from '../format/FocusedFill'
import { FocusedShapeSchema, FocusedTextAnchorSchema } from '../format/FocusedShape'
import { SimpleShapeIdSchema, TodoIdSchema } from '../types/ids-schema'

/**
 * `_systemPromptCategory` is used for system prompt generation
 * but is stripped from the JSON schema sent to the model.
 *
 * See `SystemPromptCategory.ts` for available values.
 */

// Add Detail Action
export const AddDetailAction = z
	.object({
		_type: z.literal('add-detail'),
		intent: z.string(),
	})
	.meta({
		title: 'Add Detail',
		description: 'The AI plans further work so that it can add detail to its work.',
	})

export type AddDetailAction = z.infer<typeof AddDetailAction>

// Align Action
export const AlignAction = z
	.object({
		_type: z.literal('align'),
		alignment: z.enum(['top', 'bottom', 'left', 'right', 'center-horizontal', 'center-vertical']),
		gap: z.number(),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema),
	})
	.meta({
		title: 'Align',
		description: 'The AI aligns shapes to each other on an axis.',
		_systemPromptCategory: 'edit',
	})

export type AlignAction = z.infer<typeof AlignAction>

// Bring to Front Action
export const BringToFrontAction = z
	.object({
		_type: z.literal('bringToFront'),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema),
	})
	.meta({
		title: 'Bring to Front',
		description:
			'The AI brings one or more shapes to the front so that they appear in front of everything else.',
		_systemPromptCategory: 'edit',
	})

export type BringToFrontAction = z.infer<typeof BringToFrontAction>

// Clear Action
export const ClearAction = z
	.object({
		_type: z.literal('clear'),
	})
	.meta({
		title: 'Clear',
		description: 'The agent deletes all shapes on the canvas.',
	})

export type ClearAction = z.infer<typeof ClearAction>

// Count Shapes Action
export const CountShapesAction = z
	.object({
		_type: z.literal('count'),
		expression: z.string(),
	})
	.meta({
		title: 'Count',
		description:
			'The AI requests to count the number of shapes in the canvas. The answer will be provided to the AI in a follow-up request.',
	})

export type CountShapesAction = z.infer<typeof CountShapesAction>

// Country Info Action
export const CountryInfoAction = z
	.object({
		_type: z.literal('countryInfo'),
		code: z.string(),
	})
	.meta({
		title: 'Country info',
		description:
			'The AI gets information about a country by providing its country code, eg: "de" for Germany.',
	})

export type CountryInfoAction = z.infer<typeof CountryInfoAction>

// Create Action
export const CreateAction = z
	.object({
		_type: z.literal('create'),
		intent: z.string(),
		shape: FocusedShapeSchema,
	})
	.meta({ title: 'Create', description: 'The AI creates a new shape.' })

export type CreateAction = z.infer<typeof CreateAction>

// Create Html Action
export const CreateHtmlAction = z
	.object({
		_type: z.literal('createHtml'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		html: z.string(),
	})
	.meta({
		title: 'Create Visualization',
		description:
			'The AI creates an interactive HTML visualization (a chart, diagram, table, or similar) rendered in a sandboxed frame on the canvas. Prefer this over drawing individual shapes whenever a real chart, diagram, or interactive explanation would communicate the idea better than boxes and arrows - which is most of the time for anything data-shaped, step-by-step, or comparative. The html must be a single self-contained HTML document sized to fit within w x h, with no external/CDN resources, except the local vendored libraries below which are always available at those exact paths. If the visualization involves any computed, transformed, or plotted values (not just static labels on fixed shapes), the html MUST include actual <script> logic that computes those values and renders them (e.g. draw real plotted points on a canvas or compute SVG coordinates from the real formula) - never fake the result with a static decorative shape plus a caption asserting the outcome. A smaller/simpler but genuinely computed visualization is better than an elaborate-looking one with no real logic behind it.\n\n' +
				"shapeId controls edit vs. new: if the user wants to change, correct, or add to a visualization that already exists, use that exact same shapeId again - it updates in place at its current position and size, nothing moves or duplicates. If the user wants a different or additional visualization, use a brand new shapeId - placement is handled automatically (it will never land on top of an existing visualization, so don't worry about choosing x/y to avoid overlap, just give your best-guess position).\n\n" +
				'If the request is "show this algorithm/process running step by step" and it is not one of Create Algorithm Walkthrough or Create Array Walkthrough\'s known algorithms, do not hand-write a fixed sequence of per-step UI updates (e.g. a chain of `if (step === 0) {...} else if (step === 1) {...}`) - that reliably goes wrong (a forgotten branch, a missing end-of-sequence state, a step count that desyncs from what was actually written). Instead, implement the real algorithm as plain code operating on the actual input, and record a snapshot of its state each time something meaningful happens as it actually runs, then hand those snapshots to the vendored stepper library, which owns all the Previous/Next/step-counter/disabled-at-the-ends logic so that part can never break:\n' +
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
				'`render` is called automatically for the current step whenever Previous/Next is clicked and once immediately on mount - `steps` must be complete and in order before calling `Stepper.mount`, including a final step describing the end result. This generalizes to any algorithm on any input (sorting, recursion, two-pointer, DP table fill, tree/string traversal, etc.) - the only thing that changes per topic is what real code you run and what `render` draws, never the stepping mechanism itself.\n\n' +
				'For a diagram that is NOT one of the Create Concept Map / Create Flowchart tools\' cases (e.g. a sequence diagram, state diagram, class diagram, Gantt chart, ER diagram, or any flowchart/graph where drawing it yourself in SVG would be slow and error-prone), use Mermaid instead of hand-drawing it - it is vendored locally, not a CDN:\n' +
				'<script src="/vendor/mermaid/mermaid.min.js"></script>\n' +
				'<div class="mermaid">\n' +
				'sequenceDiagram\n' +
				'  Alice->>Bob: Hello Bob, how are you?\n' +
				'  Bob-->>Alice: I am good thanks!\n' +
				'</div>\n' +
				'<script>mermaid.initialize({ startOnLoad: true });</script>\n' +
				'Write real Mermaid syntax for the actual diagram requested (flowchart TD/LR, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, etc.) inside the `.mermaid` div - `startOnLoad: true` finds and renders every such div automatically, no further code needed. Do not hand-draw with SVG/canvas anything Mermaid already has a diagram type for.\n\n' +
				'Any mathematical formula, equation, or notation (fractions, exponents, square roots, Greek letters, summations, subscripts, etc.) MUST be rendered with KaTeX, never approximated as plain text like "sqrt(x)" or "epsilon" or "x^2". KaTeX is vendored locally, not a CDN - include exactly:\n' +
				'<link rel="stylesheet" href="/vendor/katex/katex.min.css">\n' +
				'<script src="/vendor/katex/katex.min.js"></script>\n' +
				'<script src="/vendor/katex/auto-render.min.js"></script>\n' +
				'Then write LaTeX inline as $...$ or block as $$...$$ anywhere in the body, and at the end of the body call:\n' +
				'<script>renderMathInElement(document.body, {delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}]});</script>\n' +
				'Example formula source: $\\varepsilon = \\sqrt{\\frac{8}{N} \\ln\\frac{4 m_H(2N)}{\\delta}}$',
	})

export type CreateHtmlAction = z.infer<typeof CreateHtmlAction>

// Create Concept Map Action
export const CreateConceptMapAction = z
	.object({
		_type: z.literal('createConceptMap'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		title: z.string().optional(),
		nodes: z.array(z.object({ id: z.string(), label: z.string() })),
		edges: z.array(
			z.object({ from: z.string(), to: z.string(), label: z.string().optional() })
		),
	})
	.meta({
		title: 'Create Concept Map',
		description:
			'The AI creates a node-and-edge concept map showing how ideas relate to each other (e.g. "how X leads to Y", "A is a kind of B"). Prefer this over Create Visualization whenever the content is fundamentally a set of labeled concepts connected by relationships - layout is automatic (nodes are arranged into levels based on connectivity, starting from whichever nodes have no incoming edges), so just provide `nodes` and `edges`; `edges[].from`/`to` refer to `nodes[].id`. Labels may contain inline math as $...$ , which will be rendered with KaTeX automatically. shapeId controls edit vs. new, exactly as in Create Visualization: reuse the id to edit this exact map in place, use a new id for an additional one. This tool only holds short text labels, nothing is computed - if the request asks for "an example" meaning an actual worked instance with real numbers/data flowing through it (not just the relationships between concepts), use Create Visualization instead so the numbers can be genuinely computed, not just labeled.',
	})

export type CreateConceptMapAction = z.infer<typeof CreateConceptMapAction>

// Create Timeline Action
export const CreateTimelineAction = z
	.object({
		_type: z.literal('createTimeline'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		title: z.string().optional(),
		events: z.array(
			z.object({
				date: z.string(),
				title: z.string(),
				description: z.string().optional(),
			})
		),
	})
	.meta({
		title: 'Create Timeline',
		description:
			'The AI creates a chronological timeline of events or steps. Prefer this over Create Visualization for anything sequential-in-time: a history, a process that unfolds over time, a sequence of dated milestones. `date` is a short label shown next to each event (a real date, a step number, "Day 1", "Step 3", etc.) - events are rendered in the exact order given, so pass them in chronological order yourself. Text may contain inline math as $...$. This tool only holds short text labels, nothing is computed - if the request asks for "an example" meaning real computed numbers at each step (not just a description of what happens), use Create Visualization instead. shapeId controls edit vs. new, exactly as in Create Visualization.',
	})

export type CreateTimelineAction = z.infer<typeof CreateTimelineAction>

// Create Comparison Table Action
export const CreateComparisonTableAction = z
	.object({
		_type: z.literal('createComparisonTable'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		title: z.string().optional(),
		columns: z.array(z.string()),
		rows: z.array(
			z.object({
				label: z.string(),
				values: z.array(z.string()),
			})
		),
	})
	.refine((action) => action.rows.every((row) => row.values.length === action.columns.length), {
		message: 'Each row.values must have exactly one entry per column',
		path: ['rows'],
	})
	.meta({
		title: 'Create Comparison Table',
		description:
			'The AI creates a comparison table: multiple things compared across the same set of attributes. Prefer this over Create Visualization whenever the content is fundamentally "N things compared across M attributes" (e.g. comparing algorithms, concepts, or options). `columns` are the things being compared (column headers); each entry in `rows` is one attribute, with `values` given in the same order as `columns` - `rows[i].values` MUST have exactly one entry per column, in the same order, with no gaps; a missing value renders as a visibly broken "(missing)" cell, so never omit one. Cell and label text may contain inline math as $...$, which is rendered with KaTeX automatically. This tool only holds short text labels, nothing is computed - if the request asks for "an example" meaning an actual worked instance with real numbers/data (not just qualitative labels like "High"/"Low"), use Create Visualization instead so the numbers can be genuinely computed. shapeId controls edit vs. new, exactly as in Create Visualization.',
	})

export type CreateComparisonTableAction = z.infer<typeof CreateComparisonTableAction>

// Create Flowchart Action
export const CreateFlowchartAction = z
	.object({
		_type: z.literal('createFlowchart'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		title: z.string().optional(),
		nodes: z.array(
			z.object({
				id: z.string(),
				label: z.string(),
				shape: z.enum(['rect', 'diamond']).optional(),
			})
		),
		edges: z.array(
			z.object({ from: z.string(), to: z.string(), label: z.string().optional() })
		),
	})
	.meta({
		title: 'Create Flowchart',
		description:
			'The AI creates a directed flowchart: a process, algorithm, or decision procedure made of steps and arrows between them. Prefer this over Create Visualization for anything that is fundamentally "do this, then this, then branch based on a condition". Layout flows top-to-bottom automatically from whichever nodes have no incoming edges; `edges[].from`/`to` refer to `nodes[].id` and are drawn as arrows. Use `shape: "diamond"` for a decision/branch point, "rect" (the default) for a regular step. Labels may contain inline math as $...$. This tool only holds short text labels, nothing is computed - if the request asks for "an example" meaning an actual worked instance with real numbers/data flowing through the steps (not just the names of the steps), use Create Visualization instead so the numbers can be genuinely computed. shapeId controls edit vs. new, exactly as in Create Visualization.',
	})

export type CreateFlowchartAction = z.infer<typeof CreateFlowchartAction>

// Create Annotated Diagram Action
export const CreateAnnotatedDiagramAction = z
	.object({
		_type: z.literal('createAnnotatedDiagram'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		sourceShapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		title: z.string().optional(),
		annotations: z.array(
			z.object({
				xPercent: z.number(),
				yPercent: z.number(),
				label: z.string(),
			})
		),
	})
	.meta({
		title: 'Create Annotated Diagram',
		description:
			'The AI labels specific points on an existing image already on the canvas (e.g. a pasted screenshot of a diagram, a photo, a figure) with callouts. `sourceShapeId` must be the id of an existing image shape visible in context - this action copies that image and adds pins on top of it, it does not draw a new image from scratch. Each annotation is a point on the image given as a percentage of its width/height (`xPercent`/`yPercent`, both 0-100, where 0,0 is the top-left corner) with a short `label` describing what is at that point. Use this instead of Create Visualization whenever the task is "point out/label parts of this image" rather than drawing something new. shapeId controls edit vs. new, exactly as in Create Visualization.',
	})

export type CreateAnnotatedDiagramAction = z.infer<typeof CreateAnnotatedDiagramAction>

// Create Algorithm Walkthrough Action
export const CreateAlgorithmWalkthroughAction = z
	.object({
		_type: z.literal('createAlgorithmWalkthrough'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		title: z.string().optional(),
		nodes: z.array(z.object({ id: z.string(), label: z.string() })),
		edges: z.array(
			z.object({ from: z.string(), to: z.string(), label: z.string().optional() })
		),
		/**
		 * For a known algorithm, the step trace is computed deterministically
		 * from `nodes`/`edges` (see `client/tools/algorithms/`) instead of
		 * trusting the model to hand-simulate it - which it reliably gets wrong
		 * (wrong visit order, missed nodes, wrong distances) even on small
		 * graphs. Only used when `steps` is omitted.
		 */
		algorithm: z.enum(['dijkstra', 'bfs', 'dfs']).optional(),
		/** Required when `algorithm` is set: which node the algorithm starts from. */
		startNodeId: z.string().optional(),
		/**
		 * Hand-written steps, only needed for an algorithm not in `algorithm`'s
		 * known list. Ignored when `algorithm` is set.
		 */
		steps: z
			.array(
				z.object({
					description: z.string(),
					activeNodeIds: z.array(z.string()).optional(),
					visitedNodeIds: z.array(z.string()).optional(),
					activeEdges: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
				})
			)
			.optional(),
	})
	.meta({
		title: 'Create Algorithm Walkthrough',
		description:
			'The AI creates a step-by-step walkthrough of an algorithm running on a graph (e.g. Dijkstra, BFS/DFS, A*, MST algorithms) with Previous/Next buttons. Prefer this over Create Visualization or Create Flowchart whenever the request is "show how this algorithm processes this graph step by step" - layout is automatic exactly like Create Flowchart/Concept Map (nodes and edges, auto-arranged).\n\n' +
				'For `dijkstra`, `bfs`, or `dfs` (the known `algorithm` list): set `algorithm` and `startNodeId` and OMIT `steps` entirely - the exact correct trace is computed from `nodes`/`edges` in code, not guessed. For dijkstra, give each edge a numeric `label` (the weight) - edges with no numeric label default to weight 1. Do NOT hand-write `steps` for a known algorithm: manually tracing graph algorithms step by step is extremely error-prone (easy to miss a node, pick the wrong next node, or get a distance wrong), and a computed trace is always correct.\n\n' +
				'For an algorithm NOT in the known list, provide `steps` yourself instead: each entry\'s `description` explains what happens at that point; `activeNodeIds`/`activeEdges` highlight what the algorithm is currently looking at, and `visitedNodeIds` marks nodes already finalized - both are optional and reset each step (list everything that should be highlighted at that step, not just changes since the last one). Think through the trace carefully and double check it visits every node exactly once with no gaps, since there is no automatic check for a hand-written trace.\n\n' +
				'`activeEdges` entries reference nodes by the same ids used in `edges`. Labels may contain inline math as $...$. shapeId controls edit vs. new, exactly as in Create Visualization.',
	})

export type CreateAlgorithmWalkthroughAction = z.infer<typeof CreateAlgorithmWalkthroughAction>

// Create Array Walkthrough Action
export const CreateArrayWalkthroughAction = z
	.object({
		_type: z.literal('createArrayWalkthrough'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		title: z.string().optional(),
		array: z.array(z.number()),
		target: z.number().optional(),
		/**
		 * For a known algorithm, the step trace is computed deterministically
		 * from `array`/`target` instead of trusting the model to hand-simulate
		 * it - which it reliably gets wrong (e.g. a real observed failure:
		 * forgetting to handle the "no answer found" end state, leaving a dead
		 * Next button). Only used when `steps` is omitted.
		 */
		algorithm: z.enum(['two-sum', 'binary-search']).optional(),
		steps: z
			.array(
				z.object({
					description: z.string(),
					pointers: z
						.array(
							z.object({
								index: z.number(),
								label: z.string(),
								role: z.enum(['active', 'lo', 'hi', 'mid', 'found', 'excluded']),
							})
						)
						.optional(),
				})
			)
			.optional(),
	})
	.meta({
		title: 'Create Array Walkthrough',
		description:
			'The AI creates a step-by-step walkthrough of an algorithm scanning/searching an array (e.g. two-sum, binary search, two-pointer, sliding window problems - classic LeetCode-style problems) with Previous/Next buttons, shown as a row of labeled boxes with pointers. Prefer this over Create Visualization whenever the request is "trace this algorithm over this array step by step".\n\n' +
				'For `two-sum` or `binary-search` (the known `algorithm` list): set `algorithm`, `array`, and `target`, and OMIT `steps` entirely - the exact correct trace (including the "not found" end state) is computed in code, not guessed. Do NOT hand-write `steps` for a known algorithm: manually tracing a scan/search is error-prone (easy to forget the end-of-array case, miscompute an index, or leave the stepper with no way to continue).\n\n' +
				'For an algorithm NOT in the known list, provide `steps` yourself: each entry\'s `description` explains what happens, and `pointers` lists which array indices are highlighted right now and what each one means (`label` is a short tag like "i", "lo", "complement"; `role` picks its color - "found" for a final answer, "excluded" to gray out a discarded region). Always include a final step describing the end result, whether a value/pair was found or not - never leave the walkthrough without a clear stopping point.\n\n' +
				'Labels may contain inline math as $...$. shapeId controls edit vs. new, exactly as in Create Visualization.',
	})

export type CreateArrayWalkthroughAction = z.infer<typeof CreateArrayWalkthroughAction>

// Delete Action
export const DeleteAction = z
	.object({
		_type: z.literal('delete'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
	})
	.meta({ title: 'Delete', description: 'The AI deletes a shape.', _systemPromptCategory: 'edit' })

export type DeleteAction = z.infer<typeof DeleteAction>

// Distribute Action
export const DistributeAction = z
	.object({
		_type: z.literal('distribute'),
		direction: z.enum(['horizontal', 'vertical']),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema),
	})
	.meta({
		title: 'Distribute',
		description: 'The AI distributes shapes horizontally or vertically.',
		_systemPromptCategory: 'edit',
	})

export type DistributeAction = z.infer<typeof DistributeAction>

// Label Action
export const LabelAction = z
	.object({
		_type: z.literal('label'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		text: z.string(),
	})
	.meta({
		title: 'Label',
		description: "The AI changes a shape's text.",
		_systemPromptCategory: 'edit',
	})

export type LabelAction = z.infer<typeof LabelAction>

// Message Action
export const MessageAction = z
	.object({
		_type: z.literal('message'),
		text: z.string(),
	})
	.meta({ title: 'Message', description: 'The AI sends a message to the user.' })

export type MessageAction = z.infer<typeof MessageAction>

// Move Action
export const MoveAction = z
	.object({
		_type: z.literal('move'),
		intent: z.string(),
		anchor: FocusedTextAnchorSchema,
		shapeId: SimpleShapeIdSchema,
		x: z.number(),
		y: z.number(),
	})
	.meta({
		title: 'Move',
		description: 'The agent moves a shape to a new position.',
		_systemPromptCategory: 'edit',
	})

export type MoveAction = z.infer<typeof MoveAction>

// Pen Action
export const PenAction = z
	.object({
		_type: z.literal('pen'),
		shapeId: SimpleShapeIdSchema,
		color: FocusedColor,
		closed: z.boolean(),
		fill: FocusedFillSchema,
		intent: z.string(),
		points: z.array(
			z.object({
				x: z.number(),
				y: z.number(),
			})
		),
		style: z.enum(['smooth', 'straight']),
	})
	.meta({
		title: 'Pen',
		description:
			'The AI draws a freeform line with a pen. This is useful for drawing custom paths that are not available with the other available shapes. The "smooth" style will automatically smooth the line between points. The "straight" style will render a straight line between points. The "closed" property will determine if the drawn line gets automatically closed to form a complete shape or not. Remember that the pen will be *down* until the action is over. If you want to lift up the pen, start a new pen action.',
	})

export type PenAction = z.infer<typeof PenAction>

// Place Action
export const PlaceAction = z
	.object({
		_type: z.literal('place'),
		align: z.enum(['start', 'center', 'end']),
		alignOffset: z.number(),
		intent: z.string(),
		referenceShapeId: SimpleShapeIdSchema,
		side: z.enum(['top', 'bottom', 'left', 'right']),
		sideOffset: z.number(),
		shapeId: SimpleShapeIdSchema,
	})
	.meta({
		title: 'Place',
		description: 'The AI places a shape relative to another shape.',
		_systemPromptCategory: 'edit',
	})

export type PlaceAction = z.infer<typeof PlaceAction>

// Resize Action
export const ResizeAction = z
	.object({
		_type: z.literal('resize'),
		intent: z.string(),
		originX: z.number(),
		originY: z.number(),
		scaleX: z.number(),
		scaleY: z.number(),
		shapeIds: z.array(SimpleShapeIdSchema),
	})
	.meta({
		title: 'Resize',
		description:
			'The AI resizes one or more shapes, with the resize operation being performed relative to an origin point.',
		_systemPromptCategory: 'edit',
	})

export type ResizeAction = z.infer<typeof ResizeAction>

// Review Action
export const ReviewAction = z
	.object({
		_type: z.literal('review'),
		intent: z.string(),
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
	})
	.meta({
		title: 'Review',
		description:
			'The AI schedules further work or a review so that it can look at the results of its work so far and take further action, such as reviewing what it has done or taking further steps that would benefit from seeing the results of its work so far.',
	})

export type ReviewAction = z.infer<typeof ReviewAction>

// Rotate Action
export const RotateAction = z
	.object({
		_type: z.literal('rotate'),
		centerY: z.number(),
		degrees: z.number(),
		intent: z.string(),
		originX: z.number(),
		originY: z.number(),
		shapeIds: z.array(SimpleShapeIdSchema),
	})
	.meta({
		title: 'Rotate',
		description: 'The AI rotates one or more shapes around an origin point.',
		_systemPromptCategory: 'edit',
	})

export type RotateAction = z.infer<typeof RotateAction>

// Send to Back Action
export const SendToBackAction = z
	.object({
		_type: z.literal('sendToBack'),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema),
	})
	.meta({
		title: 'Send to Back',
		description:
			'The AI sends one or more shapes to the back so that they appear behind everything else.',
		_systemPromptCategory: 'edit',
	})

export type SendToBackAction = z.infer<typeof SendToBackAction>

// Set My View Action
export const SetMyViewAction = z
	.object({
		_type: z.literal('setMyView'),
		intent: z.string(),
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
	})
	.meta({
		title: 'Set My View',
		description:
			'The AI changes the bounds of its own viewport to navigate to other areas of the canvas if needed. `x` and `y` are the top-left corner of the area you want to see, and `w` and `h` are its width and height. To center your view on a point, set `x` and `y` to that point minus half the width and height.',
	})

export type SetMyViewAction = z.infer<typeof SetMyViewAction>

// Stack Action
export const StackAction = z
	.object({
		_type: z.literal('stack'),
		direction: z.enum(['vertical', 'horizontal']),
		gap: z.number(),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema),
	})
	.meta({
		title: 'Stack',
		description:
			"The AI stacks shapes horizontally or vertically. Note that this doesn't align shapes, it only stacks them along one axis.",
		_systemPromptCategory: 'edit',
	})

export type StackAction = z.infer<typeof StackAction>

// Think Action
export const ThinkAction = z
	.object({
		_type: z.literal('think'),
		text: z.string(),
	})
	.meta({ title: 'Think', description: 'The AI describes its intent or reasoning.' })

export type ThinkAction = z.infer<typeof ThinkAction>

// Todo List Action
export const UpsertPersonalTodoItemAction = z
	.object({
		_type: z.literal('update-todo-list'),
		id: TodoIdSchema,
		status: z.enum(['todo', 'in-progress', 'done']),
		text: z.string().optional(),
	})
	.meta({
		title: 'Update Todo List',
		description: 'The AI updates a current todo list item or creates a new one',
	})

export type UpsertPersonalTodoItemAction = z.infer<typeof UpsertPersonalTodoItemAction>

// Update Action
export const UpdateAction = z
	.object({
		_type: z.literal('update'),
		intent: z.string(),
		update: FocusedShapeSchema,
	})
	.meta({
		title: 'Update',
		description: 'The AI updates an existing shape.',
		_systemPromptCategory: 'edit',
	})

export type UpdateAction = z.infer<typeof UpdateAction>
// Unknown Action (catch-all for unrecognized actions)
export const UnknownAction = z
	.object({
		_type: z.literal('unknown'),
	})
	.meta({
		title: 'Unknown',
		description: 'An action with an unknown or unrecognized type.',
	})

export type UnknownAction = z.infer<typeof UnknownAction>
