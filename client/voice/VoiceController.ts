import { atom, Atom, JsonValue, react } from 'tldraw'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { createStt, SttEngineInstance } from './stt'
import { fetchLinksForPrompt } from './links'
import { voiceSettings } from './VoiceSettings'

export type VoiceStatus = 'idle' | 'listening' | 'thinking'

/**
 * Glue between the microphone and the agent.
 *
 * Voice is input-only: speech-to-text produces a final transcript, which is
 * sent to the agent exactly like a typed chat message. Replies are text-only
 * in chat - there is no text-to-speech.
 */
export class VoiceController {
	readonly $status: Atom<VoiceStatus>
	readonly $interim: Atom<string>
	readonly $error: Atom<string | null>

	/**
	 * Voice-chat session: one click starts it and the mic then stays live for
	 * the whole conversation (reopening once the agent finishes a turn) until
	 * you stop it yourself.
	 */
	readonly $session: Atom<boolean>

	private stt: SttEngineInstance | null = null
	private disposers: (() => void)[] = []
	private disposed = false

	constructor(private agent: TldrawAgent) {
		this.$status = atom('voice.status', 'idle')
		this.$interim = atom('voice.interim', '')
		this.$error = atom('voice.error', null)
		this.$session = atom('voice.session', false)

		// Keep the status atom in sync with the agent.
		this.disposers.push(
			react('voice: status from agent', () => {
				this.agent.requests.isGenerating()
				this.refreshStatus()
			})
		)

		// Session loop: whenever the session is on and everything has gone quiet,
		// reopen the mic.
		this.disposers.push(
			react('voice: session loop', () => {
				if (!this.$session.get() || this.$status.get() !== 'idle') return
				setTimeout(() => {
					if (
						!this.disposed &&
						this.$session.get() &&
						this.$status.get() === 'idle' &&
						!this.stt
					) {
						void this.startListening()
					}
				}, 400)
			})
		)
	}

	private refreshStatus() {
		if (this.disposed) return
		let next: VoiceStatus = 'idle'
		if (this.stt) next = 'listening'
		else if (this.agent.requests.isGenerating()) next = 'thinking'
		if (this.$status.get() !== next) {
			this.$status.set(next)
		}
	}

	isListening() {
		return this.stt !== null
	}

	/** Start the microphone. Any request in progress is cut off (barge-in). */
	async startListening() {
		if (this.stt || this.disposed) return
		this.$error.set(null)
		this.$interim.set('')

		const engine = voiceSettings.sttEngine.get()
		const stt = createStt(engine, {
			onInterim: (text) => this.$interim.set(text),
			onFinal: (text) => this.submit(text),
			onError: (message) => {
				this.$error.set(message)
				// Don't loop forever reopening a mic that can't open.
				this.$session.set(false)
			},
			onEnd: () => {
				if (this.stt === stt) this.stt = null
				this.$interim.set('')
				this.refreshStatus()
			},
		})
		this.stt = stt
		this.refreshStatus()
		await stt.start()
	}

	/** Stop the microphone and send whatever was heard. */
	stopListening() {
		this.stt?.stop()
	}

	/** Stop the microphone and throw away what was heard. */
	abortListening() {
		this.stt?.abort()
		this.stt = null
		this.$interim.set('')
		this.refreshStatus()
	}

	toggleListening() {
		if (this.stt) this.stopListening()
		else void this.startListening()
	}

	// ==================== Session mode ====================

	/** Start a voice-chat session: the mic stays on until you stop it. */
	startSession() {
		if (this.disposed) return
		this.$session.set(true)
		void this.startListening()
	}

	/** End the session: stop the mic and any running request. */
	stopSession() {
		this.$session.set(false)
		this.stopEverything()
	}

	toggleSession() {
		if (this.$session.get()) this.stopSession()
		else this.startSession()
	}

	/** Cancel the current request and stop listening. */
	stopEverything() {
		this.abortListening()
		this.agent.cancel()
	}

	/** Send a transcript to the agent as if it had been typed. */
	async submit(text: string) {
		const message = text.trim()
		if (!message) return

		// Any links in the message are read by the worker and shown to the model.
		// Resolve them first: the agent clones the request and can't clone promises.
		const linkPromises = fetchLinksForPrompt(message)
		let data: JsonValue[] = []
		if (linkPromises.length > 0) {
			this.$interim.set('Reading link…')
			data = await Promise.all(linkPromises)
			this.$interim.set('')
		}
		if (this.disposed) return

		this.agent.interrupt({
			input: {
				agentMessages: [message],
				userMessages: [message],
				bounds: this.agent.editor.getViewportPageBounds(),
				source: 'user',
				contextItems: this.agent.context.getItems(),
				data,
			},
		})
	}

	dispose() {
		this.disposed = true
		this.abortListening()
		for (const d of this.disposers) d()
		this.disposers = []
	}
}
