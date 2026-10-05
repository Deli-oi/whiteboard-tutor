/**
 * Phase 2 of the extension pivot: a box-select overlay that finds which
 * source-tagged element(s) (see the dev-only Vite plugin from Phase 1 -
 * scripts/vite-source-tag-plugin.ts) a drawn box covers, and shows the exact
 * [start, end) character range in the real source file. No voice or editing
 * yet - this just proves selection -> source-location resolution works from
 * the real extension, not just curl.
 */
;(function () {
	'use strict'

	let overlayEl = null
	let badgeEl = null
	let boxEl = null
	let resultPanelEl = null
	let selecting = false
	let startX = 0
	let startY = 0

	function enterSelectMode() {
		resultPanelEl?.remove()
		resultPanelEl = null

		const overlay = document.createElement('div')
		Object.assign(overlay.style, {
			position: 'fixed',
			inset: '0',
			zIndex: '2147483647',
			cursor: 'crosshair',
			background: 'rgba(0,0,0,0.02)',
		})
		overlay.addEventListener('mousedown', onMouseDown)
		document.documentElement.appendChild(overlay)
		overlayEl = overlay

		const badge = document.createElement('div')
		badge.textContent = 'Circle-select active — drag a box, Esc to cancel'
		Object.assign(badge.style, {
			position: 'fixed',
			top: '12px',
			left: '50%',
			transform: 'translateX(-50%)',
			background: '#1a1a1a',
			color: '#fff',
			padding: '6px 14px',
			borderRadius: '6px',
			fontFamily: 'system-ui, sans-serif',
			fontSize: '13px',
			zIndex: '2147483647',
			pointerEvents: 'none',
			boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
		})
		document.documentElement.appendChild(badge)
		badgeEl = badge

		document.addEventListener('keydown', onKeyDown)
	}

	/** Removes the crosshair/badge but leaves the result panel (if any) visible. */
	function exitSelectMode() {
		overlayEl?.remove()
		badgeEl?.remove()
		boxEl?.remove()
		document.removeEventListener('keydown', onKeyDown)
		overlayEl = badgeEl = boxEl = null
		selecting = false
	}

	function closeEverything() {
		exitSelectMode()
		resultPanelEl?.remove()
		resultPanelEl = null
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') closeEverything()
	}

	function onMouseDown(e) {
		selecting = true
		startX = e.clientX
		startY = e.clientY
		boxEl = document.createElement('div')
		Object.assign(boxEl.style, {
			position: 'fixed',
			border: '2px solid #3b82f6',
			background: 'rgba(59,130,246,0.15)',
			zIndex: '2147483647',
			pointerEvents: 'none',
		})
		document.documentElement.appendChild(boxEl)
		document.addEventListener('mousemove', onMouseMove)
		document.addEventListener('mouseup', onMouseUp)
		e.preventDefault()
	}

	function onMouseMove(e) {
		if (!selecting || !boxEl) return
		const x = Math.min(startX, e.clientX)
		const y = Math.min(startY, e.clientY)
		const w = Math.abs(e.clientX - startX)
		const h = Math.abs(e.clientY - startY)
		Object.assign(boxEl.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' })
	}

	function onMouseUp(e) {
		document.removeEventListener('mousemove', onMouseMove)
		document.removeEventListener('mouseup', onMouseUp)
		const rect = boxEl?.getBoundingClientRect()
		exitSelectMode()
		if (!rect || rect.width < 4 || rect.height < 4) return // a stray click, not a real drag
		showResults(rect, findMatches(rect))
	}

	/** Every source-tagged element the selection box overlaps, best match first. */
	function findMatches(selectionRect) {
		const candidates = document.querySelectorAll('[data-src-start][data-src-end]')
		const results = []
		for (const el of candidates) {
			const r = el.getBoundingClientRect()
			const ix = Math.max(0, Math.min(r.right, selectionRect.right) - Math.max(r.left, selectionRect.left))
			const iy = Math.max(0, Math.min(r.bottom, selectionRect.bottom) - Math.max(r.top, selectionRect.top))
			const intersection = ix * iy
			if (intersection <= 0) continue
			const ownArea = Math.max(1, r.width * r.height)
			results.push({
				el,
				coverage: intersection / ownArea, // how much of THIS element the box covers
				area: ownArea,
				start: Number(el.getAttribute('data-src-start')),
				end: Number(el.getAttribute('data-src-end')),
			})
		}
		// Prefer the element most fully covered by the box; among ties, the
		// smallest (most specific) one - a paragraph fully inside the box beats
		// its giant section ancestor that's only 10% covered.
		results.sort((a, b) => b.coverage - a.coverage || a.area - b.area)
		return results
	}

	function describe(el) {
		const tag = el.tagName.toLowerCase()
		const id = el.id ? '#' + el.id : ''
		const cls = el.classList.length ? '.' + Array.from(el.classList).join('.') : ''
		return tag + id + cls
	}

	function showResults(selectionRect, matches) {
		const panel = document.createElement('div')
		Object.assign(panel.style, {
			position: 'fixed',
			zIndex: '2147483647',
			maxWidth: '420px',
			background: '#1a1a1a',
			color: '#e5e5e5',
			padding: '12px 14px',
			borderRadius: '8px',
			fontFamily: 'ui-monospace, monospace',
			fontSize: '12px',
			lineHeight: '1.5',
			boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
			whiteSpace: 'pre-wrap',
		})
		panel.style.top = Math.min(selectionRect.bottom + 8, window.innerHeight - 160) + 'px'
		panel.style.left = Math.min(selectionRect.left, window.innerWidth - 440) + 'px'

		if (matches.length === 0) {
			panel.textContent =
				'No tagged elements in that box.\n' +
				'(Only elements served by the Phase 1 source-tagging dev plugin are selectable.)'
		} else {
			const best = matches[0]
			const preview = (best.el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
			panel.textContent =
				`Best match: ${describe(best.el)}\n` +
				`source range: [${best.start}, ${best.end})\n` +
				`coverage: ${(best.coverage * 100).toFixed(0)}%\n` +
				`content: "${preview}${preview.length === 80 ? '…' : ''}"` +
				(matches.length > 1
					? `\n\n(${matches.length - 1} other candidate${matches.length > 2 ? 's' : ''} also in the box)`
					: '')
		}
		document.documentElement.appendChild(panel)
		resultPanelEl = panel
	}

	chrome.runtime.onMessage.addListener((message) => {
		if (message?.type !== 'toggle-overlay') return
		if (overlayEl) closeEverything()
		else enterSelectMode()
	})
})()
