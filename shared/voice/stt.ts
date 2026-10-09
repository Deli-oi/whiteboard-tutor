/**
 * Speech-to-text through Chrome's built-in Web Speech API. Push-to-talk:
 * start() begins listening, results stream in as interim text, and the
 * request sends on its own after a short silence (or when stop() is called).
 * No server fallback by design - the extension has no backend.
 */
export interface SttCallbacks {
	/** Everything heard so far, while the user is still talking. */
	onInterim?(text: string): void
	/** The full transcript, once listening ends with something heard. */
	onFinal(text: string): void
	onError(message: string): void
	/** Listening has stopped, for any reason (fires after onFinal). */
	onEnd(): void
}

export interface SttEngineInstance {
	start(): Promise<void>
	/** Stop listening and deliver what was heard. */
	stop(): void
	/** Stop listening and discard what was heard. */
	abort(): void
}

// Only the parts of the Web Speech API this file touches; it isn't in every lib.dom target.
interface RecognitionResult {
	isFinal: boolean
	0?: { transcript: string }
}
interface Recognition {
	lang: string
	continuous: boolean
	interimResults: boolean
	maxAlternatives: number
	onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
	onerror: ((event: { error?: string }) => void) | null
	onend: (() => void) | null
	start(): void
	stop(): void
	abort(): void
}
type RecognitionConstructor = new () => Recognition

/** How long to wait after the last finished phrase before sending. */
const SILENCE_BEFORE_SEND_MS = 1500

/** Errors that just mean "nothing was said" or "we stopped it ourselves". */
const QUIET_ERRORS = new Set(['no-speech', 'aborted'])

/**
 * Mic permission is granted per-origin, so the very first time you use voice
 * on a site you haven't before, Chrome either prompts for it or - if the
 * prompt can't be shown for some reason, or it was previously denied -
 * fails with 'not-allowed' and no further explanation. Surfacing the raw
 * code (confirmed live: a user saw literally "Speech recognition error:
 * not-allowed" with no idea what to do about it) isn't actionable; this
 * turns the handful of error codes actually worth explaining into something
 * a user can act on without knowing what the Web Speech API is.
 */
function describeSttError(code: string | undefined): string {
	switch (code) {
		case 'not-allowed':
		case 'service-not-allowed':
			return "Microphone access is blocked for this page. Click the lock/camera icon in the address bar, allow the microphone, then try again - permission is granted per-site, so a page you haven't used this on before needs it granted once."
		case 'audio-capture':
			return 'No microphone found, or it’s in use by another app. Check your mic and try again.'
		case 'network':
			return "Speech recognition needs a network connection (Chrome's speech-to-text runs server-side) - check your connection and try again."
		default:
			return `Speech recognition error: ${code ?? 'unknown'}`
	}
}

export function createStt(callbacks: SttCallbacks): SttEngineInstance {
	let active: Recognition | null = null
	let heard = ''
	let silenceTimer: ReturnType<typeof setTimeout> | undefined

	return {
		async start() {
			const scope = window as unknown as {
				SpeechRecognition?: RecognitionConstructor
				webkitSpeechRecognition?: RecognitionConstructor
			}
			const SpeechRecognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition
			if (!SpeechRecognition) {
				callbacks.onError('This browser has no built-in speech recognition.')
				callbacks.onEnd()
				return
			}

			const recognition = new SpeechRecognition()
			recognition.lang = navigator.language || 'en-US'
			recognition.continuous = true
			recognition.interimResults = true
			recognition.maxAlternatives = 1
			heard = ''

			recognition.onresult = ({ resultIndex, results }) => {
				let stillSpeaking = ''
				let finishedPhrase = false
				for (let i = resultIndex; i < results.length; i++) {
					const words = results[i][0]?.transcript ?? ''
					if (results[i].isFinal) {
						heard += words + ' '
						finishedPhrase = true
					} else {
						stillSpeaking += words
					}
				}
				callbacks.onInterim?.((heard + stillSpeaking).trim())

				clearTimeout(silenceTimer)
				if (finishedPhrase && !stillSpeaking) {
					silenceTimer = setTimeout(() => recognition.stop(), SILENCE_BEFORE_SEND_MS)
				}
			}
			recognition.onerror = ({ error }) => {
				if (error && QUIET_ERRORS.has(error)) return
				callbacks.onError(describeSttError(error))
			}
			recognition.onend = () => {
				clearTimeout(silenceTimer)
				active = null
				const transcript = heard.trim()
				if (transcript) callbacks.onFinal(transcript)
				callbacks.onEnd()
			}

			active = recognition
			recognition.start()
		},

		stop() {
			active?.stop()
		},

		abort() {
			const recognition = active
			if (!recognition) return
			active = null
			clearTimeout(silenceTimer)
			recognition.onend = null
			recognition.abort()
			callbacks.onEnd()
		},
	}
}
