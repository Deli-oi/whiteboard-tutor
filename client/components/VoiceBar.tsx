import { useEffect, useState } from 'react'
import { useValue } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { runDemoLesson } from '../demo/runDemoLesson'
import { getAccessToken, setAccessToken } from '../voice/api'
import { isBrowserSttSupported } from '../voice/stt'
import { VoiceController } from '../voice/VoiceController'
import { voiceSettings } from '../voice/VoiceSettings'

/**
 * The voice controls that sit above the chat input: a big mic button, a
 * status line with the live transcript, and a settings drawer.
 */
export function VoiceBar() {
	const agent = useAgent()

	// Created in an effect (not useMemo) so React StrictMode's mount/unmount/mount
	// in dev doesn't leave us holding a disposed controller.
	const [controller, setController] = useState<VoiceController | null>(null)
	useEffect(() => {
		const c = new VoiceController(agent)
		setController(c)
		// Expose for quick manual testing from the devtools console.
		;(window as any).__voice = c
		;(window as any).__agent = agent
		// `?demo` replays a scripted lesson so you can try the experience with no API key.
		let demoTimer: ReturnType<typeof setTimeout> | null = null
		if (new URLSearchParams(window.location.search).has('demo')) {
			demoTimer = setTimeout(() => void runDemoLesson(agent), 800)
		}
		return () => {
			if (demoTimer) clearTimeout(demoTimer)
			c.dispose()
		}
	}, [agent])

	if (!controller) return null
	return <VoiceBarInner controller={controller} />
}

function VoiceBarInner({ controller }: { controller: VoiceController }) {

	const status = useValue('voice.status', () => controller.$status.get(), [controller])
	const interim = useValue('voice.interim', () => controller.$interim.get(), [controller])
	const error = useValue('voice.error', () => controller.$error.get(), [controller])
	const sessionOn = useValue('voice.session', () => controller.$session.get(), [controller])
	const [showSettings, setShowSettings] = useState(false)

	// Push-to-talk: hold V while the canvas or panel has focus (not while typing).
	useEffect(() => {
		let held = false
		const isTyping = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null
			return !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)
		}
		const down = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== 'v' || e.repeat || held || isTyping(e)) return
			if (e.metaKey || e.ctrlKey || e.altKey) return
			held = true
			e.preventDefault()
			void controller.startListening()
		}
		const up = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== 'v' || !held) return
			held = false
			controller.stopListening()
		}
		window.addEventListener('keydown', down)
		window.addEventListener('keyup', up)
		return () => {
			window.removeEventListener('keydown', down)
			window.removeEventListener('keyup', up)
		}
	}, [controller])

	const label = sessionOn
		? status === 'listening'
			? 'Listening…'
			: status === 'thinking'
				? 'Thinking…'
				: 'Voice chat on'
		: 'Start voice chat (or hold V to talk)'

	return (
		<div className="voice-bar">
			<div className="voice-row">
				<button
					type="button"
					className={`voice-mic voice-mic--${status} ${sessionOn ? 'voice-mic--session' : ''}`}
					onClick={() => controller.toggleSession()}
					aria-label={sessionOn ? 'Stop voice chat' : 'Start voice chat'}
					title={sessionOn ? 'Stop voice chat' : 'Start voice chat'}
				>
					{sessionOn ? '■' : '🎙'}
				</button>
				<div className="voice-status">
					<div className="voice-status-label">{label}</div>
					{sessionOn && status === 'thinking' && (
						<button
							type="button"
							className="voice-interrupt"
							onClick={() => void controller.startListening()}
						>
							✋ Interrupt
						</button>
					)}
					{interim && <div className="voice-interim">{interim}</div>}
					{error && <div className="voice-error">{error}</div>}
				</div>
				<button
					type="button"
					className={`voice-settings-toggle ${showSettings ? 'active' : ''}`}
					onClick={() => setShowSettings((v) => !v)}
					title="Voice settings"
				>
					⚙
				</button>
			</div>
			{showSettings && <VoiceSettingsPanel />}
		</div>
	)
}

function VoiceSettingsPanel() {
	const tutorMode = useValue('voice.tutorMode', () => voiceSettings.tutorMode.get(), [])
	const sttEngine = useValue('voice.sttEngine', () => voiceSettings.sttEngine.get(), [])

	const sttSupported = isBrowserSttSupported()

	return (
		<div className="voice-settings">
			<label>
				<input
					type="checkbox"
					checked={tutorMode}
					onChange={(e) => voiceSettings.tutorMode.set(e.target.checked)}
				/>
				Tutor mode (no screenshots, fewer tokens)
			</label>

			<label className="voice-settings-row">
				<span>Ears</span>
				<select
					value={sttEngine}
					onChange={(e) => voiceSettings.sttEngine.set(e.target.value as 'browser' | 'openai' | 'groq')}
				>
					<option value="groq">Groq whisper-large-v3-turbo (free tier)</option>
					<option value="browser" disabled={!sttSupported}>
						Browser {sttSupported ? '(free)' : '(not supported here)'}
					</option>
					<option value="openai">OpenAI gpt-4o-mini-transcribe (~$0.003/min)</option>
				</select>
			</label>

			<label className="voice-settings-row">
				<span>Access token</span>
				<input
					type="password"
					placeholder="only if the server requires one"
					defaultValue={getAccessToken()}
					onChange={(e) => setAccessToken(e.target.value.trim())}
					autoComplete="off"
				/>
			</label>
		</div>
	)
}
