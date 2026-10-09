/**
 * Generic Next/Previous stepper for interactive HTML visualizations. Owns
 * the button wiring, disabled-at-bounds state, and step counter - the parts
 * that kept breaking when hand-written fresh for every topic (a forgotten
 * button in one branch, a missing end-of-sequence state, a step counter
 * that desyncs from the real number of steps).
 *
 * Usage:
 *   const steps = [];
 *   // Run the REAL algorithm and snapshot its state as it actually executes -
 *   // never hand-write a fixed list of steps from memory.
 *   function linearSearch(arr, target) {
 *     for (let i = 0; i < arr.length; i++) {
 *       steps.push({ index: i, found: arr[i] === target });
 *       if (arr[i] === target) return i;
 *     }
 *     steps.push({ index: -1, found: false, done: true });
 *     return -1;
 *   }
 *   linearSearch([3, 7, 2, 9], 2);
 *   Stepper.mount({
 *     container: document.getElementById('controls'),
 *     steps: steps,
 *     render: function (step, index, total) {
 *       // update the DOM to reflect `step` here
 *     },
 *   });
 */
;(function () {
	function mount(options) {
		var container = options.container
		var steps = options.steps
		var render = options.render

		if (!steps || steps.length === 0) {
			throw new Error('Stepper.mount: steps must be a non-empty array')
		}

		var current = 0

		var controls = document.createElement('div')
		controls.style.cssText = 'display:flex;align-items:center;gap:12px;margin-top:12px;'

		var prevBtn = document.createElement('button')
		prevBtn.textContent = 'Previous'
		var nextBtn = document.createElement('button')
		nextBtn.textContent = 'Next'
		var counter = document.createElement('span')
		counter.style.cssText = 'font-size:12px;color:#64748b;'
		;[prevBtn, nextBtn].forEach(function (button) {
			button.style.cssText =
				'padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;cursor:pointer;'
		})

		// Controls live right after `container`, not inside it: generated render
		// functions routinely do `container.innerHTML = ...` on the same element
		// they passed as `container`, which silently deleted buttons placed
		// inside it (confirmed from a beta bug report). Re-attached after each
		// render in case a render rewrites an ancestor too.
		function attachControls() {
			if (controls.isConnected) return
			if (container && container.isConnected && container !== document.body) {
				container.insertAdjacentElement('afterend', controls)
			} else {
				document.body.appendChild(controls)
			}
		}

		function update() {
			render(steps[current], current, steps.length)
			attachControls()
			counter.textContent = 'Step ' + (current + 1) + ' / ' + steps.length
			prevBtn.disabled = current === 0
			nextBtn.disabled = current === steps.length - 1
			prevBtn.style.opacity = prevBtn.disabled ? '0.4' : '1'
			nextBtn.style.opacity = nextBtn.disabled ? '0.4' : '1'
			prevBtn.style.cursor = prevBtn.disabled ? 'default' : 'pointer'
			nextBtn.style.cursor = nextBtn.disabled ? 'default' : 'pointer'
		}

		prevBtn.addEventListener('click', function () {
			if (current > 0) {
				current--
				update()
			}
		})
		nextBtn.addEventListener('click', function () {
			if (current < steps.length - 1) {
				current++
				update()
			}
		})

		controls.appendChild(prevBtn)
		controls.appendChild(counter)
		controls.appendChild(nextBtn)
		attachControls()

		update()

		return {
			getCurrentIndex: function () {
				return current
			},
		}
	}

	window.Stepper = { mount: mount }
})()
