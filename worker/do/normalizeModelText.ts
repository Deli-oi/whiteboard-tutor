/**
 * Coerce whatever the model wrote into the JSON text the action parser expects.
 *
 * Models usually answer with `{"actions": [...]}` as asked. Sometimes they slip
 * into the notation the chat history uses to *display* past actions: prose with
 * `[ACTION]: {...}` markers, either on their own lines or inline mid-sentence.
 * Rather than drop (or worse, speak) the whole reply, prose becomes `message`
 * actions and each `[ACTION]` JSON object becomes a real action.
 *
 * Works on partial (still-streaming) text: the result may be an unterminated
 * JSON prefix, which `closeAndParseJson` knows how to close.
 */
export function normalizeModelText(raw: string): string {
	let text = raw.replace(/^\s+/, '')

	// Strip a leading markdown code fence, and a trailing one (possibly partial).
	if (text.startsWith('```')) {
		text = text.replace(/^```[a-zA-Z]*\s*/, '')
	}
	text = text.replace(/\s*`{1,3}\s*$/, '')

	// "[ACTION]: {...}" also starts with "[", same as a genuine bare JSON array,
	// but it's the prose-fallback marker format below, not an array - exclude it
	// specifically rather than trying to positively define what a "real" array
	// looks like.
	const isActionMarker = /^\[\s*ACTION\s*\]\s*:/i.test(text)
	if (text.startsWith('{') || (text.startsWith('[') && !isActionMarker)) return text

	// Prose fallback.
	const items: string[] = []

	const pushProse = (prose: string) => {
		for (const paragraph of prose.split(/\n\s*\n/)) {
			const clean = paragraph.replace(/\s+/g, ' ').trim()
			if (clean) items.push(JSON.stringify({ _type: 'message', text: clean }))
		}
	}

	// An action marker anywhere in the text: "[ACTION]: {" or a line starting "ACTION: {".
	const marker = /(?:\[ACTION\]|(?:^|\n)\s*ACTION)\s*:\s*(?=\{)/gi
	let cursor = 0
	let match: RegExpExecArray | null
	while ((match = marker.exec(text)) !== null) {
		pushProse(text.slice(cursor, match.index))
		const jsonStart = marker.lastIndex
		const jsonEnd = findJsonEnd(text, jsonStart)
		if (jsonEnd === -1) {
			// Still streaming: the rest is one incomplete action, take it and stop.
			items.push(text.slice(jsonStart))
			cursor = text.length
			break
		}
		items.push(text.slice(jsonStart, jsonEnd))
		cursor = jsonEnd
		marker.lastIndex = jsonEnd
	}
	pushProse(text.slice(cursor))

	return '{"actions":[' + items.join(',')
}

/** Index just past the matching close brace of the object starting at `start`, or -1. */
function findJsonEnd(text: string, start: number): number {
	let depth = 0
	let inString = false
	let escaped = false
	for (let i = start; i < text.length; i++) {
		const c = text[i]
		if (inString) {
			if (escaped) escaped = false
			else if (c === '\\') escaped = true
			else if (c === '"') inString = false
		} else if (c === '"') {
			inString = true
		} else if (c === '{') {
			depth++
		} else if (c === '}') {
			depth--
			if (depth === 0) return i + 1
		}
	}
	return -1
}
