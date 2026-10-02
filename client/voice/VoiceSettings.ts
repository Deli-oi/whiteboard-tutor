import { atom, Atom, react } from 'tldraw'

export type SttEngine = 'browser' | 'openai' | 'groq'

/**
 * User-facing voice settings. Persisted to localStorage so they survive reloads.
 *
 * Voice is input-only: speech goes in via `sttEngine`, replies are text-only in
 * chat. There is no text-to-speech.
 *
 * Default: Groq's hosted whisper-large-v3-turbo (free tier, sub-second, needs
 * GROQ_API_KEY on the worker). The browser's own free speech recognition and
 * OpenAI ears (~$0.003/min, needs OPENAI_API_KEY) are also available.
 */
export interface VoiceSettingsValues {
	/** Use the lean, voice-first `tutor` agent mode (no screenshots). */
	tutorMode: boolean
	/** Which speech-to-text engine to use. */
	sttEngine: SttEngine
}

const STORAGE_KEY = 'whiteboard-tutor:voice-settings'

const DEFAULTS: VoiceSettingsValues = {
	tutorMode: true,
	sttEngine: 'groq',
}

function load(): VoiceSettingsValues {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return DEFAULTS
		return { ...DEFAULTS, ...JSON.parse(raw) }
	} catch {
		return DEFAULTS
	}
}

function makeAtoms(values: VoiceSettingsValues) {
	return {
		tutorMode: atom('voice.tutorMode', values.tutorMode),
		sttEngine: atom<SttEngine>('voice.sttEngine', values.sttEngine),
	} satisfies { [K in keyof VoiceSettingsValues]: Atom<VoiceSettingsValues[K]> }
}

/** Module-level singleton: one set of voice settings per page. */
export const voiceSettings = makeAtoms(load())

/** Read every setting at once (reactive when used inside `useValue` / `react`). */
export function getVoiceSettings(): VoiceSettingsValues {
	return {
		tutorMode: voiceSettings.tutorMode.get(),
		sttEngine: voiceSettings.sttEngine.get(),
	}
}

// Persist on every change.
if (typeof window !== 'undefined') {
	react('persist voice settings', () => {
		const values = getVoiceSettings()
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
		} catch {
			// ignore: private mode or storage full
		}
	})
}
