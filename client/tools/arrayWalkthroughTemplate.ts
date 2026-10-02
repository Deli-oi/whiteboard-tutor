import { CreateArrayWalkthroughAction } from '../../shared/schema/AgentActionSchemas'
import { ArrayStep } from './algorithms/arrayTypes'
import { renderMathText } from './mathText'
import { contentSize, wrapTemplateHtml } from './templateShell'

const STYLES = `
	.av-array { display: flex; gap: 6px; flex-wrap: wrap; }
	.av-cell {
		position: relative;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: #eff6ff;
		border: 1.5px solid #3b82f6;
		font-size: 14px;
		font-weight: 600;
		transition: background 0.2s, border-color 0.2s;
	}
	.av-cell.lo, .av-cell.hi, .av-cell.mid { background: #fef08a; border-color: #ca8a04; }
	.av-cell.active { background: #fef08a; border-color: #ca8a04; }
	.av-cell.found { background: #bbf7d0; border-color: #16a34a; }
	.av-cell.excluded { opacity: 0.35; }
	.av-index { position: absolute; top: -18px; font-size: 10px; color: #94a3b8; }
	.av-pointer-label {
		position: absolute;
		bottom: -20px;
		font-size: 10.5px;
		font-weight: 700;
		color: #92400e;
		white-space: nowrap;
	}
	.av-pointer-label.found { color: #166534; }
	.av-controls { display: flex; align-items: center; gap: 12px; margin-top: 32px; }
	.av-controls button {
		padding: 6px 14px;
		font-size: 13px;
		border-radius: 6px;
		border: 1px solid #cbd5e1;
		background: #f8fafc;
		cursor: pointer;
	}
	.av-controls button:disabled { opacity: 0.4; cursor: default; }
	.av-step-counter { font-size: 12px; color: #64748b; }
	.av-description { margin-top: 10px; font-size: 13px; line-height: 1.4; min-height: 2.6em; }
`

/** Escapes `</` so embedded JSON can't prematurely close the surrounding <script> tag. */
function safeJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function renderArrayWalkthrough(
	action: CreateArrayWalkthroughAction,
	steps: ArrayStep[],
	w: number,
	h: number
): string {
	const content = contentSize(w, h)
	const titleHtml = action.title
		? `<div class="tool-title">${renderMathText(action.title)}</div>`
		: ''

	const cellsHtml = action.array
		.map(
			(value, i) => `<div class="av-cell" id="cell-${i}">
				<span class="av-index">${i}</span>
				${value}
			</div>`
		)
		.join('')

	const stepsData = safeJson(steps)

	const script = `<script>
		const STEPS = ${stepsData};
		let current = 0;
		function render() {
			const step = STEPS[current];
			document.querySelectorAll('.av-cell').forEach((el) => {
				el.classList.remove('active', 'lo', 'hi', 'mid', 'found', 'excluded');
				const label = el.querySelector('.av-pointer-label');
				if (label) label.remove();
			});
			step.pointers.forEach((p) => {
				const el = document.getElementById('cell-' + p.index);
				if (!el) return;
				el.classList.add(p.role);
				const label = document.createElement('span');
				label.className = 'av-pointer-label' + (p.role === 'found' ? ' found' : '');
				label.textContent = p.label;
				el.appendChild(label);
			});
			document.getElementById('av-description').textContent = step.description;
			document.getElementById('av-counter').textContent = 'Step ' + (current + 1) + ' / ' + STEPS.length;
			document.getElementById('av-prev').disabled = current === 0;
			document.getElementById('av-next').disabled = current === STEPS.length - 1;
		}
		function next() { if (current < STEPS.length - 1) { current++; render(); } }
		function prev() { if (current > 0) { current--; render(); } }
		render();
	</script>`

	return wrapTemplateHtml(
		`<div style="padding: 12px; width: ${content.w - 24}px;">
			${titleHtml}
			<div class="av-array">${cellsHtml}</div>
			<div class="av-description" id="av-description"></div>
			<div class="av-controls">
				<button id="av-prev" onclick="prev()">Previous</button>
				<span class="av-step-counter" id="av-counter"></span>
				<button id="av-next" onclick="next()">Next</button>
			</div>
		</div>${script}`,
		STYLES
	)
}
