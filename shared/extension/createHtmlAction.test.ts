import { describe, expect, it } from 'vitest'
import { buildExtensionSystemPrompt, ExtensionCreateHtmlAction } from './createHtmlAction'

describe('ExtensionCreateHtmlAction schema', () => {
	it('accepts a valid createHtml action', () => {
		const result = ExtensionCreateHtmlAction.safeParse({ _type: 'createHtml', html: '<div>hi</div>' })
		expect(result.success).toBe(true)
	})

	it('rejects a different _type', () => {
		const result = ExtensionCreateHtmlAction.safeParse({ _type: 'message', html: '<div>hi</div>' })
		expect(result.success).toBe(false)
	})

	it('rejects a missing html field', () => {
		const result = ExtensionCreateHtmlAction.safeParse({ _type: 'createHtml' })
		expect(result.success).toBe(false)
	})

	it('rejects a non-string html field', () => {
		const result = ExtensionCreateHtmlAction.safeParse({ _type: 'createHtml', html: 123 })
		expect(result.success).toBe(false)
	})
})

describe('buildExtensionSystemPrompt', () => {
	const prompt = buildExtensionSystemPrompt()

	it('embeds the createHtml JSON schema for the model to follow', () => {
		expect(prompt).toContain('"actions"')
		expect(prompt).toContain('createHtml')
	})

	it('includes the backslash-doubling warning that fixes the confirmed LaTeX-corruption bug', () => {
		expect(prompt).toMatch(/backslash/i)
		expect(prompt).toMatch(/doubled/i)
	})

	it('includes the code-snippet whitespace-preservation guidance', () => {
		expect(prompt).toMatch(/white-space:\s*pre-wrap/)
	})

	it('references the vendored library paths, not a CDN', () => {
		expect(prompt).toContain('/vendor/katex/')
		expect(prompt).toContain('/vendor/mermaid/')
		expect(prompt).toContain('/vendor/chartjs/')
		expect(prompt).toContain('/vendor/stepper/')
	})

	it('tells the model this is one-shot with no way to ask a clarifying question', () => {
		expect(prompt).toMatch(/one-shot/i)
	})
})
