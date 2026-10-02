import { useEffect, useRef } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, RecordProps, T, TLShape, toDomPrecision } from 'tldraw'
import { HTML_SHAPE_FRAME } from './htmlShapeConstants'

// Registers 'html' into tldraw's global shape-type map (its documented extension
// point for custom shapes) so TLShape/TLBaseBoxShape generics recognize it.
declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		html: { w: number; h: number; html: string }
	}
}

/**
 * The agent's real visualization output: a sandboxed iframe rendering a
 * self-contained HTML document the model wrote (charts, diagrams, tables,
 * interactive explanations). This is what CLAUDE.md meant by "output =
 * interactive HTML, not tldraw shapes" - native shapes (boxes/arrows/text)
 * are still used for quick annotations, but this is the real explanation.
 */
export type HtmlShape = TLShape<'html'>

// Clicking the frame always hits the canvas, not the iframe, so the shape
// can still be grabbed/selected/dragged even though the iframe itself is
// always interactive (see component() below).
const FRAME = HTML_SHAPE_FRAME

const HTML_SHAPE_ERROR_SOURCE = 'html-shape-error'

/**
 * The sandboxed iframe has its own console - a bug in the model's generated
 * JS (wrong selector, undefined variable, whatever) fails completely
 * silently from the outside, with zero signal that anything went wrong. This
 * is prepended to every srcDoc, before the model's own scripts, so any error
 * - including one thrown while the model's own top-level script runs - gets
 * caught and relayed to the parent's console via postMessage.
 */
function withErrorReporting(html: string): string {
	return (
		`<script>(function(){
			function report(message) {
				try { parent.postMessage({ source: ${JSON.stringify(HTML_SHAPE_ERROR_SOURCE)}, message: String(message) }, '*') } catch (e) {}
			}
			window.onerror = function(message, source, lineno, colno, error) {
				report((error && error.stack) || (message + ' (line ' + lineno + ')'))
			}
			window.addEventListener('unhandledrejection', function(e) {
				report('Unhandled promise rejection: ' + ((e.reason && e.reason.stack) || e.reason))
			})
		})()</script>` + html
	)
}

export class HtmlShapeUtil extends BaseBoxShapeUtil<HtmlShape> {
	static override type = 'html' as const
	static override props: RecordProps<HtmlShape> = {
		w: T.number,
		h: T.number,
		html: T.string,
	}

	// tldraw's own embed/video shapes only accept pointer events once you
	// double-click into "edit mode" - the right call for a one-off embed, but
	// wrong here: these are interactive steppers/charts meant to be clicked
	// through immediately, not discovered via a hidden gesture. So the iframe
	// is always interactive, with no edit-mode concept at all - double-click
	// does nothing special.
	override canEdit() {
		return false
	}

	override getDefaultProps(): HtmlShape['props'] {
		return { w: 400, h: 300, html: '' }
	}

	override component(shape: HtmlShape) {
		const { w, h, html } = shape.props
		const innerW = Math.max(0, w - FRAME * 2)
		const innerH = Math.max(0, h - FRAME * 2)
		// Interactive on the real canvas, but not inside the small read-only
		// diff-preview thumbnail (Accept/Reject), where clicking a button inside
		// a not-yet-committed preview wouldn't mean anything useful anyway.
		const isReadonly = this.editor.getIsReadonly()

		const iframeRef = useRef<HTMLIFrameElement>(null)

		useEffect(() => {
			const onMessage = (e: MessageEvent) => {
				// There can be more than one iframe for the same shape id at once
				// (this one, plus a read-only copy in the chat-history diff preview)
				// - a ref to this exact DOM node, not a document-wide id lookup, is
				// the only reliable way to attribute a message to this instance.
				if (e.source !== iframeRef.current?.contentWindow) return
				if (e.data?.source !== HTML_SHAPE_ERROR_SOURCE) return
				console.error(`[html shape ${shape.id}] runtime error inside generated HTML:`, e.data.message)
			}
			window.addEventListener('message', onMessage)
			return () => window.removeEventListener('message', onMessage)
		}, [shape.id])

		return (
			<HTMLContainer id={shape.id} className="html-shape-container">
				<div
					className="html-shape-frame"
					style={{
						width: toDomPrecision(w),
						height: toDomPrecision(h),
						padding: FRAME,
						boxSizing: 'border-box',
						background: 'white',
						borderRadius: 8,
						boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
					}}
				>
					<iframe
						ref={iframeRef}
						className="html-shape-iframe"
						title="Interactive visualization"
						data-shape-id={shape.id}
						// No allow-same-origin: the iframe gets its own opaque origin, so a
						// script inside it can't reach this page's DOM, storage, or cookies
						// even though it can run arbitrary JS.
						sandbox="allow-scripts"
						srcDoc={withErrorReporting(html)}
						width={toDomPrecision(innerW)}
						height={toDomPrecision(innerH)}
						draggable={false}
						referrerPolicy="no-referrer"
						tabIndex={0}
						style={{
							width: '100%',
							height: '100%',
							display: 'block',
							border: 0,
							pointerEvents: isReadonly ? 'none' : 'auto',
						}}
					/>
				</div>
			</HTMLContainer>
		)
	}

	override getIndicatorPath(shape: HtmlShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}
