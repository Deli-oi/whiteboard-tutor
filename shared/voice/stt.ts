/**
 * Speech-to-text. Browser-only (Web Speech API - Chrome, Edge, Safari;
 * not Firefox) by design: the extension is Chrome-only and has no shared
 * backend to fall back to. A Groq/OpenAI recorded-clip fallback existed
 * here before the pivot to a bring-your-own-key extension, but it posted to
 * a worker that Tier 1 no longer has - confirmed dead/broken code, removed
 * rather than carried forward.
 */
export interface SttCallbacks {
	/** Partial text while the user is still talking. */
	onInterim?(text: string): void
	/** Final text once the user stops talking. */
	onFinal(text: string): void
	onError(message: string): void
	/** Fired when the engine actually stops listening, for any reason. */
	onEnd(): void
}

export interface SttEngineInstance {
	start(): Promise<void>
	stop(): void
	abort(): void
}

// The Web Speech API is not in lib.dom for all TS targets; declare the bits we use.
type SpeechRecognitionLike = {
	lang: string
	continuous: boolean
	interimResults: boolean
	maxAlternatives: number
	onresult: ((e: any) => void) | null
	onerror: ((e: any) => void) | null
	onend: (() => void) | null
	start(): void
	stop(): void
	abort(): void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
	const w = window as any
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isBrowserSttSupported() {
	return typeof window !== 'undefined' && getSpeechRecognitionCtor() !== null
}

/** After the last final phrase, wait this long for more speech before sending. */
const AUTO_SEND_AFTER_MS = 1500

export class BrowserStt implements SttEngineInstance {
	private recognition: SpeechRecognitionLike | null = null
	private finalText = ''
	private autoSendTimer: ReturnType<typeof setTimeout> | null = null

	constructor(private callbacks: SttCallbacks) {}

	async start() {
		const Ctor = getSpeechRecognitionCtor()
		if (!Ctor) {
			this.callbacks.onError('This browser has no built-in speech recognition.')
			this.callbacks.onEnd()
			return
		}
		const rec = new Ctor()
		rec.lang = navigator.language || 'en-US'
		rec.continuous = true
		rec.interimResults = true
		rec.maxAlternatives = 1
		this.finalText = ''

		rec.onresult = (e: any) => {
			let interim = ''
			let gotFinal = false
			for (let i = e.resultIndex; i < e.results.length; i++) {
				const result = e.results[i]
				const transcript: string = result[0]?.transcript ?? ''
				if (result.isFinal) {
					this.finalText += transcript + ' '
					gotFinal = true
				} else {
					interim += transcript
				}
			}
			this.callbacks.onInterim?.((this.finalText + interim).trim())

			// Send on your own once you stop talking, so a second click isn't needed.
			if (this.autoSendTimer) clearTimeout(this.autoSendTimer)
			if (gotFinal && !interim) {
				this.autoSendTimer = setTimeout(() => this.stop(), AUTO_SEND_AFTER_MS)
			}
		}
		rec.onerror = (e: any) => {
			// 'no-speech' and 'aborted' are normal when the user just clicks stop
			if (e?.error === 'no-speech' || e?.error === 'aborted') return
			this.callbacks.onError(`Speech recognition error: ${e?.error ?? 'unknown'}`)
		}
		rec.onend = () => {
			if (this.autoSendTimer) clearTimeout(this.autoSendTimer)
			this.autoSendTimer = null
			const text = this.finalText.trim()
			this.recognition = null
			if (text) this.callbacks.onFinal(text)
			this.callbacks.onEnd()
		}

		this.recognition = rec
		rec.start()
	}

	stop() {
		this.recognition?.stop()
	}

	abort() {
		const rec = this.recognition
		this.recognition = null
		if (rec) {
			rec.onend = null
			rec.abort()
			this.callbacks.onEnd()
		}
	}
}

export function createStt(callbacks: SttCallbacks): SttEngineInstance {
	return new BrowserStt(callbacks)
}
