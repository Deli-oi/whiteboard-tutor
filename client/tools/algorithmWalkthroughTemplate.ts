import { CreateAlgorithmWalkthroughAction } from '../../shared/schema/AgentActionSchemas'
import { AlgorithmStep } from './algorithms/types'
import { computeGraphLayout } from './graphLayout'
import { renderMathText } from './mathText'
import { contentSize, wrapTemplateHtml } from './templateShell'

const STYLES = `
	.aw-graph { position: relative; }
	.aw-node {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 8px;
		font-size: 12.5px;
		line-height: 1.25;
		overflow: hidden;
		word-break: break-word;
		border-radius: 8px;
		background: #eff6ff;
		border: 1.5px solid #3b82f6;
		transition: background 0.2s, border-color 0.2s;
	}
	.aw-node.active { background: #fef08a; border-color: #ca8a04; border-width: 2.5px; }
	.aw-node.visited { background: #bbf7d0; border-color: #16a34a; }
	.aw-edge { stroke: #64748b; stroke-width: 1.5; transition: stroke 0.2s, stroke-width 0.2s; }
	.aw-edge.active { stroke: #ca8a04; stroke-width: 3; }
	.aw-edge-label {
		position: absolute;
		transform: translate(-50%, -50%);
		background: white;
		padding: 1px 5px;
		border-radius: 4px;
		font-size: 11px;
		color: #475569;
		border: 1px solid #e2e8f0;
		white-space: nowrap;
	}
	.aw-controls { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
	.aw-controls button {
		padding: 6px 14px;
		font-size: 13px;
		border-radius: 6px;
		border: 1px solid #cbd5e1;
		background: #f8fafc;
		cursor: pointer;
	}
	.aw-controls button:disabled { opacity: 0.4; cursor: default; }
	.aw-step-counter { font-size: 12px; color: #64748b; }
	.aw-description { margin-top: 10px; font-size: 13px; line-height: 1.4; min-height: 2.6em; }
`

function edgeKey(from: string, to: string): string {
	return `${from}__${to}`
}

/** Escapes `</` so embedded JSON can't prematurely close the surrounding <script> tag. */
function safeJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function renderAlgorithmWalkthrough(
	action: CreateAlgorithmWalkthroughAction,
	steps: AlgorithmStep[],
	w: number,
	h: number
): string {
	const content = contentSize(w, h)
	const titleHtml = action.title
		? `<div class="tool-title">${renderMathText(action.title)}</div>`
		: ''
	const titleHeight = action.title ? 32 : 0
	const controlsHeight = 90
	const graphW = content.w - 24
	const graphH = content.h - 24 - titleHeight - controlsHeight

	const { positions, edges } = computeGraphLayout(action.nodes, action.edges, {
		width: graphW,
		height: graphH,
		direction: 'vertical',
		arrows: false,
	})

	const nodeHtml = action.nodes
		.map((node) => {
			const pos = positions.get(node.id)
			if (!pos) return ''
			const w = 100
			const h = 44
			return `<div class="aw-node" id="node-${node.id}" style="left:${pos.x - w / 2}px; top:${pos.y - h / 2}px; width:${w}px; height:${h}px;">
				<span>${renderMathText(node.label)}</span>
			</div>`
		})
		.join('')

	const svgLines = edges
		.map((edge) => {
			const from = positions.get(edge.from)
			const to = positions.get(edge.to)
			if (!from || !to) return ''
			return `<line id="edge-${edgeKey(edge.from, edge.to)}" class="aw-edge" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`
		})
		.join('')

	const edgeLabels = edges
		.filter((e) => e.label)
		.map((edge) => {
			const from = positions.get(edge.from)
			const to = positions.get(edge.to)
			if (!from || !to) return ''
			const midX = (from.x + to.x) / 2
			const midY = (from.y + to.y) / 2
			return `<span class="aw-edge-label" style="left:${midX}px; top:${midY}px;">${renderMathText(edge.label!)}</span>`
		})
		.join('')

	const stepsData = safeJson(
		steps.map((step) => ({
			description: step.description,
			activeNodeIds: step.activeNodeIds ?? [],
			visitedNodeIds: step.visitedNodeIds ?? [],
			activeEdgeKeys: (step.activeEdges ?? []).map((e) => edgeKey(e.from, e.to)),
		}))
	)

	const script = `<script>
		const STEPS = ${stepsData};
		let current = 0;
		function render() {
			const step = STEPS[current];
			document.querySelectorAll('.aw-node').forEach((el) => el.classList.remove('active', 'visited'));
			document.querySelectorAll('.aw-edge').forEach((el) => el.classList.remove('active'));
			step.visitedNodeIds.forEach((id) => {
				const el = document.getElementById('node-' + id);
				if (el) el.classList.add('visited');
			});
			step.activeNodeIds.forEach((id) => {
				const el = document.getElementById('node-' + id);
				if (el) el.classList.add('active');
			});
			step.activeEdgeKeys.forEach((key) => {
				const el = document.getElementById('edge-' + key);
				if (el) el.classList.add('active');
			});
			document.getElementById('aw-description').textContent = step.description;
			document.getElementById('aw-counter').textContent = 'Step ' + (current + 1) + ' / ' + STEPS.length;
			document.getElementById('aw-prev').disabled = current === 0;
			document.getElementById('aw-next').disabled = current === STEPS.length - 1;
		}
		function next() { if (current < STEPS.length - 1) { current++; render(); } }
		function prev() { if (current > 0) { current--; render(); } }
		render();
	</script>`

	return wrapTemplateHtml(
		`<div style="padding: 12px;">
			${titleHtml}
			<div class="aw-graph" style="width:${graphW}px; height:${graphH}px;">
				<svg width="${graphW}" height="${graphH}" style="position: absolute; top:0; left:0;">${svgLines}</svg>
				${nodeHtml}
				${edgeLabels}
			</div>
			<div class="aw-description" id="aw-description"></div>
			<div class="aw-controls">
				<button id="aw-prev" onclick="prev()">Previous</button>
				<span class="aw-step-counter" id="aw-counter"></span>
				<button id="aw-next" onclick="next()">Next</button>
			</div>
		</div>${script}`,
		STYLES
	)
}
