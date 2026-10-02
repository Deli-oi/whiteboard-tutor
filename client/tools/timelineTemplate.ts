import { CreateTimelineAction } from '../../shared/schema/AgentActionSchemas'
import { renderMathText } from './mathText'
import { contentSize, wrapTemplateHtml } from './templateShell'

const STYLES = `
	.timeline { position: relative; padding-left: 24px; }
	.timeline::before {
		content: '';
		position: absolute;
		left: 5px;
		top: 6px;
		bottom: 6px;
		width: 2px;
		background: #cbd5e1;
	}
	.timeline-event { position: relative; padding-bottom: 18px; }
	.timeline-event:last-child { padding-bottom: 0; }
	.timeline-dot {
		position: absolute;
		left: -24px;
		top: 4px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #3b82f6;
		border: 2px solid white;
		box-shadow: 0 0 0 1.5px #3b82f6;
	}
	.timeline-date {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #3b82f6;
		margin-bottom: 2px;
	}
	.timeline-title { font-size: 13.5px; font-weight: 600; margin-bottom: 2px; }
	.timeline-description { font-size: 12.5px; color: #475569; line-height: 1.4; }
`

export function renderTimeline(action: CreateTimelineAction, w: number, h: number): string {
	const content = contentSize(w, h)
	const titleHtml = action.title
		? `<div class="tool-title">${renderMathText(action.title)}</div>`
		: ''

	const events = action.events
		.map(
			(event) => `<div class="timeline-event">
				<div class="timeline-dot"></div>
				<div class="timeline-date">${renderMathText(event.date)}</div>
				<div class="timeline-title">${renderMathText(event.title)}</div>
				${event.description ? `<div class="timeline-description">${renderMathText(event.description)}</div>` : ''}
			</div>`
		)
		.join('')

	return wrapTemplateHtml(
		`<div style="padding: 16px; width: ${content.w - 32}px; min-height: ${content.h - 32}px;">${titleHtml}<div class="timeline">${events}</div></div>`,
		STYLES
	)
}
