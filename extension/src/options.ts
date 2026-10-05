const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement
const saveButton = document.getElementById('save') as HTMLButtonElement
const statusEl = document.getElementById('status') as HTMLDivElement

chrome.storage.local.get('geminiApiKey').then(({ geminiApiKey }) => {
	if (typeof geminiApiKey === 'string') apiKeyInput.value = geminiApiKey
})

saveButton.addEventListener('click', async () => {
	await chrome.storage.local.set({ geminiApiKey: apiKeyInput.value.trim() })
	statusEl.textContent = 'Saved.'
	setTimeout(() => {
		statusEl.textContent = ''
	}, 2000)
})
