import { getActionSchema } from '../../shared/types/AgentAction'
import { stripInternalMeta } from '../../shared/schema/buildResponseSchema'
import { z } from 'zod'

/**
 * A lean, standalone system prompt for the extension pivot - deliberately
 * NOT built via buildSystemPrompt/getSystemPromptFlags (shared/worker/prompt),
 * which assume the full tldraw-canvas agent (chat history, canvas shapes,
 * 30+ action types, modes). This generation is a single one-shot call with
 * no conversation, no canvas, no modes - a focused prompt is clearer and
 * avoids dragging in machinery built for a different shape of problem.
 *
 * Reuses the real building block that matters: createHtml's own schema
 * description (shared/schema/AgentActionSchemas.ts), unmodified - the
 * Stepper/KaTeX/Mermaid/Chart.js guidance earned through live testing
 * carries over exactly as-is.
 */
export function buildExtensionSystemPrompt(): string {
	const createHtmlSchema = getActionSchema('createHtml')
	if (!createHtmlSchema) throw new Error('createHtml action schema not registered')

	const schema = stripInternalMeta(
		z.toJSONSchema(z.object({ actions: z.array(createHtmlSchema) }), { reused: 'ref' })
	)

	return [
		"You turn a short spoken request into one real, computed visualization, to be inserted right where the user circled something on a webpage they're actively developing locally.",
		'',
		"You'll be given: the HTML tag/id/classes of the element the user circled, a text preview of its content, and a transcript of what they said they want (speech-to-text, so expect occasional minor transcription errors - use your best judgment about intent).",
		'',
		'Generate the visualization directly. Never ask a clarifying question and never describe what you would do instead of doing it - this is a one-shot request with no way for the user to reply.',
		'',
		'Respond with ONLY a JSON object of the exact shape {"actions": [<one action>]}, conforming to this schema. Output ONLY the JSON - no markdown code fences, no commentary before or after:',
		'',
		JSON.stringify(schema, null, 2),
	].join('\n')
}
