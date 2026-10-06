/** Shows just enough of the key to recognize it, not enough to be useful to anyone looking over your shoulder. */
function maskKey(key: string): string {
	return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

interface KeyFieldConfig {
	storageKey: string
	/** Matches the HTML id prefix - e.g. "gemini" for #geminiApiKey, #geminiSave, etc. */
	idPrefix: string
	validate: (key: string) => boolean
	invalidMessage: string
}

/**
 * Wires up one provider's key field (Gemini and Groq both use this, see the
 * bottom of the file) - save/validate, masked re-display with an explicit
 * "Change key" action instead of repopulating the full secret into the
 * input every time the page opens, a show/hide toggle, and remove.
 */
function setupKeyField(config: KeyFieldConfig) {
	const input = document.getElementById(`${config.idPrefix}ApiKey`) as HTMLInputElement
	const saveButton = document.getElementById(`${config.idPrefix}Save`) as HTMLButtonElement
	const statusEl = document.getElementById(`${config.idPrefix}Status`) as HTMLDivElement
	const keyDisplayEl = document.getElementById(`${config.idPrefix}KeyDisplay`) as HTMLDivElement
	const keyMaskEl = document.getElementById(`${config.idPrefix}KeyMask`) as HTMLElement
	const keyFormEl = document.getElementById(`${config.idPrefix}KeyForm`) as HTMLDivElement
	const changeKeyButton = document.getElementById(`${config.idPrefix}ChangeKey`) as HTMLButtonElement
	const removeKeyButton = document.getElementById(`${config.idPrefix}RemoveKey`) as HTMLButtonElement
	const toggleVisibilityButton = document.getElementById(`${config.idPrefix}ToggleVisibility`) as HTMLButtonElement

	async function render() {
		const stored = await chrome.storage.local.get(config.storageKey)
		const key = stored[config.storageKey]
		const hasKey = typeof key === 'string' && key.length > 0
		keyDisplayEl.style.display = hasKey ? 'block' : 'none'
		keyFormEl.style.display = hasKey ? 'none' : 'block'
		if (hasKey) keyMaskEl.textContent = maskKey(key)
	}
	void render()

	changeKeyButton.addEventListener('click', () => {
		keyDisplayEl.style.display = 'none'
		keyFormEl.style.display = 'block'
		input.value = ''
		input.focus()
	})

	removeKeyButton.addEventListener('click', async () => {
		await chrome.storage.local.remove(config.storageKey)
		await render()
	})

	toggleVisibilityButton.addEventListener('click', () => {
		const willShow = input.type === 'password'
		input.type = willShow ? 'text' : 'password'
		toggleVisibilityButton.textContent = willShow ? '🙈' : '👁'
	})

	saveButton.addEventListener('click', async () => {
		const key = input.value.trim()
		if (!key) {
			statusEl.textContent = 'Paste a key first.'
			return
		}
		if (!config.validate(key)) {
			statusEl.textContent = config.invalidMessage
			return
		}
		await chrome.storage.local.set({ [config.storageKey]: key })
		input.value = ''
		await render()
		statusEl.textContent = 'Saved.'
		setTimeout(() => {
			statusEl.textContent = ''
		}, 2000)
	})
}

/**
 * Loose-but-real validation, not a strict format spec - just enough to fail
 * loudly now instead of with a confusing "generation failed" later. Catches
 * the actual mistakes people make pasting a key (grabbing a URL, the wrong
 * provider's key, trailing whitespace/newline from the copy).
 */
setupKeyField({
	storageKey: 'geminiApiKey',
	idPrefix: 'gemini',
	validate: (key) => /^AIza[\w-]{30,40}$/.test(key),
	invalidMessage: 'That doesn\'t look like a Gemini API key (should start with "AIza"). Double-check what you pasted.',
})

setupKeyField({
	storageKey: 'groqApiKey',
	idPrefix: 'groq',
	validate: (key) => /^gsk_[A-Za-z0-9]{40,60}$/.test(key),
	invalidMessage: 'That doesn\'t look like a Groq API key (should start with "gsk_"). Double-check what you pasted.',
})
