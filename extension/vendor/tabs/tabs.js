/**
 * Tabs for generated visualizations. Owns the buttons and switching - the
 * part that broke when hand-written with radio inputs and :checked CSS (a beta
 * report showed every tab blank because the panels' parent was display:none).
 *
 * Usage (no JavaScript needed):
 *   <div data-tabs>
 *     <section data-tab="Diagram">...</section>
 *     <section data-tab="Stepper">...</section>
 *   </div>
 *   <script src="/vendor/tabs/tabs.js"></script>
 *
 * Inactive panels are hidden with visibility + zero height, not display:none,
 * so Mermaid, Chart.js, and KaTeX inside them still lay out at real size.
 */
;(function () {
	function setup(root) {
		if (root.getAttribute('data-tabs-ready')) return
		var panels = Array.prototype.filter.call(root.children, function (el) {
			return el.hasAttribute('data-tab')
		})
		if (panels.length === 0) return
		root.setAttribute('data-tabs-ready', 'true')

		var bar = document.createElement('div')
		bar.setAttribute('role', 'tablist')
		bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;border-bottom:1px solid #e2e8f0;margin-bottom:10px;'
		var body = document.createElement('div')
		body.style.cssText = 'position:relative;'

		var buttons = panels.map(function (panel, i) {
			var button = document.createElement('button')
			button.type = 'button'
			button.setAttribute('role', 'tab')
			button.textContent = panel.getAttribute('data-tab') || 'Tab ' + (i + 1)
			button.style.cssText =
				'padding:6px 12px;font:inherit;font-size:13px;border:none;border-bottom:2px solid transparent;' +
				'margin-bottom:-1px;background:none;cursor:pointer;color:#475569;'
			button.addEventListener('click', function () {
				select(i)
			})
			bar.appendChild(button)
			return button
		})

		root.insertBefore(bar, panels[0])
		root.insertBefore(body, panels[0])
		panels.forEach(function (panel) {
			body.appendChild(panel)
		})

		function select(index) {
			panels.forEach(function (panel, i) {
				var active = i === index
				panel.style.visibility = active ? '' : 'hidden'
				panel.style.position = active ? '' : 'absolute'
				panel.style.left = active ? '' : '0'
				panel.style.right = active ? '' : '0'
				panel.style.top = active ? '' : '0'
				panel.style.height = active ? '' : '0'
				panel.style.overflow = active ? '' : 'hidden'
				panel.setAttribute('aria-hidden', active ? 'false' : 'true')
				buttons[i].setAttribute('aria-selected', active ? 'true' : 'false')
				buttons[i].style.borderBottomColor = active ? '#3b82f6' : 'transparent'
				buttons[i].style.color = active ? '#0f172a' : '#475569'
				buttons[i].style.fontWeight = active ? '600' : '400'
			})
			// Charts that measured themselves while hidden re-measure on resize.
			window.dispatchEvent(new Event('resize'))
		}
		select(0)
	}

	function init() {
		Array.prototype.forEach.call(document.querySelectorAll('[data-tabs]'), setup)
	}

	window.Tabs = { init: init }
	init()
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
})()
