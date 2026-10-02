import { atom, Atom, react } from 'tldraw'
import { isBrowserSttSupported } from './stt'

export type SttEngine = 'browser' | 'openai' | 'groq'

/**
 * User-facing voice settings. Persisted to localStorage so they survive reloads.
 *
 * Voice is input-only: speech goes in via `sttEngine`, replies are text-only in
 * chat. There is no text-to-speech.
 *
 * Default: the browser's own free speech recognition where it's supported
 * (Chrome/Edge/Safari) - zero network round-trip, so it streams interim
 * results as you talk, which matters given latency is this project's stated
 * #1 priority. Falls back to Groq's hosted whisper-large-v3-turbo (free tier,
 * still sub-second, needs GROQ_API_KEY) where the browser API isn't available
 * (Firefox). OpenAI ears (~$0.003/min, needs OPENAI_API_KEY) are also
 * available as a paid accuracy upgrade.
 */
export interface VoiceSettingsValues {
	/** Use the lean, voice-first `tutor` agent mode (no screenshots). */
	tutorMode: boolean
	/** Which speech-to-text engine to use. */
	sttEngine: SttEngine
}

const STORAGE_KEY = 'whiteboard-tutor:voice-settings'

function defaults(): VoiceSettingsValues {
	return {
		tutorMode: true,
		sttEngine: isBrowserSttSupported() ? 'browser' : 'groq',
	}
}

function load(): VoiceSettingsValues {
	const DEFAULTS = defaults()
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
