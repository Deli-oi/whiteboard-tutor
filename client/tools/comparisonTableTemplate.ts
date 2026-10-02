import { CreateComparisonTableAction } from '../../shared/schema/AgentActionSchemas'
import { renderMathText } from './mathText'
import { contentSize, wrapTemplateHtml } from './templateShell'

const STYLES = `
	table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
	th, td {
		border: 1px solid #e2e8f0;
		padding: 8px 10px;
		text-align: left;
		vertical-align: top;
	}
	th { background: #f1f5f9; font-weight: 600; }
	th:first-child, td:first-child { background: #f8fafc; font-weight: 600; }
	td.missing { color: #cbd5e1; font-style: italic; }
`

export function renderComparisonTable(
	action: CreateComparisonTableAction,
	w: number,
	h: number
): string {
	const content = contentSize(w, h)
	const titleHtml = action.title
		? `<div class="tool-title">${renderMathText(action.title)}</div>`
		: ''

	const headerRow = `<tr><th></th>${action.columns.map((c) => `<th>${renderMathText(c)}</th>`).join('')}</tr>`

	const bodyRows = action.rows
		.map((row) => {
			// A missing value is a malformed model response (row.values shorter
			// than columns), not a legitimately blank cell - render it visibly
			// as "missing" rather than silently leaving a blank <td> that looks
			// like a finished, intentionally-empty table.
			const cells = action.columns
				.map((_, i) =>
					row.values[i] !== undefined
						? `<td>${renderMathText(row.values[i])}</td>`
						: `<td class="missing">(missing)</td>`
				)
				.join('')
			return `<tr><td>${renderMathText(row.label)}</td>${cells}</tr>`
		})
		.join('')

	return wrapTemplateHtml(
		`<div style="padding: 16px; width: ${content.w - 32}px; min-height: ${content.h - 32}px; overflow: auto;">${titleHtml}<table>${headerRow}${bodyRows}</table></div>`,
		STYLES
	)
}
