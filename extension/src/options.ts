const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement
const saveButton = document.getElementById('save') as HTMLButtonElement
const statusEl = document.getElementById('status') as HTMLDivElement
const keyDisplayEl = document.getElementById('keyDisplay') as HTMLDivElement
const keyMaskEl = document.getElementById('keyMask') as HTMLElement
const keyFormEl = document.getElementById('keyForm') as HTMLDivElement
const changeKeyButton = document.getElementById('changeKey') as HTMLButtonElement
const removeKeyButton = document.getElementById('removeKey') as HTMLButtonElement
const toggleVisibilityButton = document.getElementById('toggleVisibility') as HTMLButtonElement

/** Shows just enough of the key to recognize it, not enough to be useful to anyone looking over your shoulder. */
function maskKey(key: string): string {
	return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

/**
 * Loose-but-real validation: AI Studio keys always start "AIza" and run
 * ~39 characters of a fixed charset. Catches the actual mistakes people
 * make pasting a key (grabbing a URL, a Workspace OAuth secret like
 * "GOCSPX-...", trailing whitespace/newline from the copy) - not meant to
 * be a strict format spec, just enough to fail loudly now instead of with
 * a confusing "generation failed" later.
 */
function looksLikeGeminiKey(key: string): boolean {
	return /^AIza[\w-]{30,40}$/.test(key)
}

/**
 * The key is shown masked by default, not repopulated in full every time
 * this page opens - "Change key" is an explicit action, so the full secret
 * only ever sits visible in the DOM while you're actively entering it.
 */
async function render() {
	const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey')
	const hasKey = typeof geminiApiKey === 'string' && geminiApiKey.length > 0
	keyDisplayEl.style.display = hasKey ? 'block' : 'none'
	keyFormEl.style.display = hasKey ? 'none' : 'block'
	if (hasKey) keyMaskEl.textContent = maskKey(geminiApiKey)
}
void render()

changeKeyButton.addEventListener('click', () => {
	keyDisplayEl.style.display = 'none'
	keyFormEl.style.display = 'block'
	apiKeyInput.value = ''
	apiKeyInput.focus()
})

removeKeyButton.addEventListener('click', async () => {
	await chrome.storage.local.remove('geminiApiKey')
	await render()
})

toggleVisibilityButton.addEventListener('click', () => {
	const willShow = apiKeyInput.type === 'password'
	apiKeyInput.type = willShow ? 'text' : 'password'
	toggleVisibilityButton.textContent = willShow ? '🙈' : '👁'
})

saveButton.addEventListener('click', async () => {
	const key = apiKeyInput.value.trim()
	if (!key) {
		statusEl.textContent = 'Paste a key first.'
		return
	}
	if (!looksLikeGeminiKey(key)) {
		statusEl.textContent = 'That doesn\'t look like a Gemini API key (should start with "AIza"). Double-check what you pasted.'
		return
	}
	await chrome.storage.local.set({ geminiApiKey: key })
	apiKeyInput.value = ''
	await render()
	statusEl.textContent = 'Saved.'
	setTimeout(() => {
		statusEl.textContent = ''
	}, 2000)
})
