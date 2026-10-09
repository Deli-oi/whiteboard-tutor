import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStt, SttCallbacks } from './stt'

class FakeRecognition {
	static last: FakeRecognition
	lang = ''
	continuous = false
	interimResults = false
	maxAlternatives = 0
	onresult: ((event: { resultIndex: number; results: unknown[] }) => void) | null = null
	onerror: ((event: { error?: string }) => void) | null = null
	onend: (() => void) | null = null
	started = false
	constructor() {
		FakeRecognition.last = this
	}
	start() {
		this.started = true
	}
	stop() {
		this.onend?.()
	}
	abort() {
		this.onend?.()
	}
	say(resultIndex: number, results: Array<[string, boolean]>) {
		this.onresult?.({
			resultIndex,
			results: results.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })),
		})
	}
}

function callbacks() {
	return {
		onInterim: vi.fn(),
		onFinal: vi.fn(),
		onError: vi.fn(),
		onEnd: vi.fn(),
	} satisfies SttCallbacks
}

describe('createStt', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })
		vi.stubGlobal('navigator', { language: 'en-US' })
	})
	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it('streams interim text and sends after a short silence', async () => {
		const cb = callbacks()
		await createStt(cb).start()
		const rec = FakeRecognition.last
		expect(rec.started && rec.continuous && rec.interimResults).toBe(true)

		rec.say(0, [['plot the', false]])
		expect(cb.onInterim).toHaveBeenLastCalledWith('plot the')
		rec.say(0, [['plot the data', true]])
		expect(cb.onFinal).not.toHaveBeenCalled()

		vi.advanceTimersByTime(1500)
		expect(cb.onFinal).toHaveBeenCalledWith('plot the data')
		expect(cb.onEnd).toHaveBeenCalledTimes(1)
	})

	it('keeps waiting while the user is still mid-phrase', async () => {
		const cb = callbacks()
		await createStt(cb).start()
		const rec = FakeRecognition.last
		rec.say(0, [['first part', true]])
		rec.say(1, [['first part', true], ['and more', false]])
		vi.advanceTimersByTime(5000)
		expect(cb.onFinal).not.toHaveBeenCalled()
		expect(cb.onInterim).toHaveBeenLastCalledWith('first part and more')
	})

	it('stop() delivers what was heard', async () => {
		const cb = callbacks()
		const stt = createStt(cb)
		await stt.start()
		FakeRecognition.last.say(0, [['make it blue', true]])
		stt.stop()
		expect(cb.onFinal).toHaveBeenCalledWith('make it blue')
		expect(cb.onEnd).toHaveBeenCalledTimes(1)
	})

	it('abort() discards what was heard and still ends once', async () => {
		const cb = callbacks()
		const stt = createStt(cb)
		await stt.start()
		FakeRecognition.last.say(0, [['never mind', true]])
		stt.abort()
		vi.advanceTimersByTime(5000)
		expect(cb.onFinal).not.toHaveBeenCalled()
		expect(cb.onEnd).toHaveBeenCalledTimes(1)
	})

	it('ignores quiet errors and explains a blocked mic', async () => {
		const cb = callbacks()
		await createStt(cb).start()
		FakeRecognition.last.onerror?.({ error: 'no-speech' })
		expect(cb.onError).not.toHaveBeenCalled()
		FakeRecognition.last.onerror?.({ error: 'not-allowed' })
		expect(cb.onError.mock.calls[0][0]).toMatch(/Microphone access is blocked/)
	})

	it('reports when the browser has no speech recognition', async () => {
		vi.stubGlobal('window', {})
		const cb = callbacks()
		await createStt(cb).start()
		expect(cb.onError).toHaveBeenCalledWith('This browser has no built-in speech recognition.')
		expect(cb.onEnd).toHaveBeenCalledTimes(1)
	})
})
