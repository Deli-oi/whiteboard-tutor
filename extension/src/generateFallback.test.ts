import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }))

vi.mock('ai', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ai')>()
	return { ...actual, generateText: generateTextMock }
})
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: () => () => 'gemini-model-stub' }))
vi.mock('@ai-sdk/groq', () => ({ createGroq: () => () => 'groq-model-stub' }))

const { generateVisualizationHtml } = await import('./generate')

const selection = { tag: 'p' }
const goodResponseText = JSON.stringify({
	actions: [{ _type: 'createHtml', html: `<div>${'x'.repeat(100)}</div>` }],
})

/**
 * These test the FALLBACK DECISION TREE - which provider gets tried, in what
 * order, and when the other is skipped - not the actual model call, which is
 * mocked out entirely. The content-quality retry logic itself (thin output,
 * unparseable JSON) already has direct coverage in generate.test.ts.
 */
describe('generateVisualizationHtml provider fallback', () => {
	beforeEach(() => {
		generateTextMock.mockReset()
	})

	it('throws immediately with no key configured, never calling the model', async () => {
		await expect(generateVisualizationHtml({}, 'hi', selection)).rejects.toThrow('No API key set')
		expect(generateTextMock).not.toHaveBeenCalled()
	})

	it('uses Gemini alone when it succeeds, never touching Groq', async () => {
		generateTextMock.mockResolvedValueOnce({ text: goodResponseText })
		const result = await generateVisualizationHtml({ gemini: 'fake-gemini-key' }, 'hi', selection)
		expect(result._type).toBe('createHtml')
		expect(generateTextMock).toHaveBeenCalledTimes(1)
	})

	it('falls back to Groq when Gemini fails and a Groq key is configured', async () => {
		generateTextMock.mockRejectedValueOnce(new Error('Gemini is down'))
		generateTextMock.mockResolvedValueOnce({ text: goodResponseText })
		const result = await generateVisualizationHtml(
			{ gemini: 'fake-gemini-key', groq: 'fake-groq-key' },
			'hi',
			selection
		)
		expect(result._type).toBe('createHtml')
		expect(generateTextMock).toHaveBeenCalledTimes(2)
	})

	it('surfaces the original error when Gemini fails and no Groq key is configured', async () => {
		generateTextMock.mockRejectedValue(new Error('Gemini is down'))
		await expect(generateVisualizationHtml({ gemini: 'fake-gemini-key' }, 'hi', selection)).rejects.toThrow(
			'Gemini is down'
		)
		expect(generateTextMock).toHaveBeenCalledTimes(1)
	})

	it('goes straight to Groq when only a Groq key is configured', async () => {
		generateTextMock.mockResolvedValueOnce({ text: goodResponseText })
		const result = await generateVisualizationHtml({ groq: 'fake-groq-key' }, 'hi', selection)
		expect(result._type).toBe('createHtml')
		expect(generateTextMock).toHaveBeenCalledTimes(1)
	})

	it('does not fall back to Groq for a vision request, since Groq has no image support', async () => {
		generateTextMock.mockRejectedValue(new Error('Gemini is down'))
		await expect(
			generateVisualizationHtml(
				{ gemini: 'fake-gemini-key', groq: 'fake-groq-key' },
				'hi',
				selection,
				undefined,
				'base64-image-data'
			)
		).rejects.toThrow('Gemini is down')
		expect(generateTextMock).toHaveBeenCalledTimes(1)
	})

	it('passes an abort signal so a hung provider times out', async () => {
		generateTextMock.mockResolvedValueOnce({ text: goodResponseText })
		await generateVisualizationHtml({ gemini: 'fake-gemini-key' }, 'hi', selection)
		expect(generateTextMock.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal)
	})

	it('reports a timeout clearly and does not retry it', async () => {
		generateTextMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
		await expect(generateVisualizationHtml({ gemini: 'fake-gemini-key' }, 'hi', selection)).rejects.toThrow(
			'The model took too long to respond. Try again.'
		)
		expect(generateTextMock).toHaveBeenCalledTimes(1)
	})

	it('still falls back to Groq after a Gemini timeout', async () => {
		generateTextMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
		generateTextMock.mockResolvedValueOnce({ text: goodResponseText })
		const result = await generateVisualizationHtml(
			{ gemini: 'fake-gemini-key', groq: 'fake-groq-key' },
			'hi',
			selection
		)
		expect(result._type).toBe('createHtml')
		expect(generateTextMock).toHaveBeenCalledTimes(2)
	})

	it('skips Gemini 429 retries and goes straight to Groq when a Groq key is set', async () => {
		generateTextMock.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))
		generateTextMock.mockResolvedValueOnce({ text: goodResponseText })
		const result = await generateVisualizationHtml(
			{ gemini: 'fake-gemini-key', groq: 'fake-groq-key' },
			'hi',
			selection
		)
		expect(result._type).toBe('createHtml')
		expect(generateTextMock).toHaveBeenCalledTimes(2)
		expect(generateTextMock.mock.calls[1][0].model).toBe('groq-model-stub')
	})

	it('still retries a Gemini 429 when there is no Groq key to fall back to', async () => {
		generateTextMock.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))
		generateTextMock.mockResolvedValueOnce({ text: goodResponseText })
		const result = await generateVisualizationHtml({ gemini: 'fake-gemini-key' }, 'hi', selection)
		expect(result._type).toBe('createHtml')
		expect(generateTextMock).toHaveBeenCalledTimes(2)
		expect(generateTextMock.mock.calls[1][0].model).toBe('gemini-model-stub')
	})

	it('still retries a Gemini 429 on a vision request, since Groq cannot take over', async () => {
		generateTextMock.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))
		generateTextMock.mockResolvedValueOnce({ text: goodResponseText })
		const result = await generateVisualizationHtml(
			{ gemini: 'fake-gemini-key', groq: 'fake-groq-key' },
			'hi',
			selection,
			undefined,
			'base64-image-data'
		)
		expect(result._type).toBe('createHtml')
		expect(generateTextMock).toHaveBeenCalledTimes(2)
		expect(generateTextMock.mock.calls[1][0].model).toBe('gemini-model-stub')
	})
})
