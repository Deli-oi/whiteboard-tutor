/**
 * Pulls the JSON object out of a model reply. The prompt asks for bare JSON,
 * but models sometimes wrap it in a ```json fence or add a sentence before or
 * after it, so everything outside the outermost {...} is ignored. Returns null
 * when no valid object is found; the caller retries.
 */
export function parseModelJson(text: string): Record<string, unknown> | null {
	const start = text.indexOf('{')
	const end = text.lastIndexOf('}')
	if (start === -1 || end <= start) return null
	try {
		const value: unknown = JSON.parse(text.slice(start, end + 1))
		if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
		return value as Record<string, unknown>
	} catch {
		return null
	}
}
