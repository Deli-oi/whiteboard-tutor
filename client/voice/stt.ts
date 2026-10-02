/**
 * Speech-to-text engines.
 *
 * - `BrowserStt` uses the Web Speech API (Chrome, Edge, Safari). Free, streams
 *   interim text while you talk. Not available in Firefox.
 * - `GroqStt` records a clip with MediaRecorder and posts it to the worker's
 *   `/transcribe-groq` route (whisper-large-v3-turbo, free tier). The default.
 * - `OpenAiStt` records a clip with MediaRecorder and posts it to the worker's
 *   `/transcribe` route (gpt-4o-mini-transcribe, about $0.003 per minute).
 */

import { apiFetch } from './api'

export interface SttCallbacks {
	/** Partial text while the user is still talking (browser engine only). */
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
			this.callbacks.onError('This browser has no built-in speech recognition. Switch to OpenAI.')
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

/** Records a clip with MediaRecorder and posts it to a worker transcription route. */
abstract class RecordedClipStt implements SttEngineInstance {
	private recorder: MediaRecorder | null = null
	private stream: MediaStream | null = null
	private chunks: Blob[] = []
	private aborted = false

	protected abstract readonly endpoint: string

	constructor(private callbacks: SttCallbacks) {}

	async start() {
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
		} catch {
			this.callbacks.onError('Microphone permission was denied.')
			this.callbacks.onEnd()
			return
		}
		const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
		const recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
		this.chunks = []
		this.aborted = false
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) this.chunks.push(e.data)
		}
		recorder.onstop = async () => {
			this.stream?.getTracks().forEach((t) => t.stop())
			this.stream = null
			this.recorder = null
			if (this.aborted) {
				this.callbacks.onEnd()
				return
			}
			const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' })
			this.chunks = []
			if (blob.size < 2000) {
				// Too short to contain speech
				this.callbacks.onEnd()
				return
			}
			try {
				const form = new FormData()
				form.append('audio', blob, 'clip.webm')
				const res = await apiFetch(this.endpoint, { method: 'POST', body: form })
				if (!res.ok) throw new Error(await res.text())
				const { text } = (await res.json()) as { text: string }
				if (text?.trim()) this.callbacks.onFinal(text.trim())
			} catch (e: any) {
				this.callbacks.onError(e?.message ?? 'Transcription failed')
			} finally {
				this.callbacks.onEnd()
			}
		}
		this.recorder = recorder
		recorder.start()
		this.callbacks.onInterim?.('Recording… click the mic again when you are done.')
	}

	stop() {
		if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
	}

	abort() {
		this.aborted = true
		this.stop()
	}
}

export class OpenAiStt extends RecordedClipStt {
	protected readonly endpoint = '/transcribe'
}

export class GroqStt extends RecordedClipStt {
	protected readonly endpoint = '/transcribe-groq'
}

export function createStt(engine: 'browser' | 'openai' | 'groq', callbacks: SttCallbacks): SttEngineInstance {
	if (engine === 'openai') return new OpenAiStt(callbacks)
	if (engine === 'groq') return new GroqStt(callbacks)
	return new BrowserStt(callbacks)
}
