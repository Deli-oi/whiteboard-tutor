import { IRequest } from 'itty-router'
import { Environment } from '../environment'

// A minute of webm/opus speech is well under 1 MB; this is a generous cap.
const MAX_BYTES = 5 * 1024 * 1024

async function readAudio(request: IRequest): Promise<File | Response> {
	const declared = Number(request.headers.get('Content-Length') ?? 0)
	if (declared > MAX_BYTES) return new Response('Audio too large', { status: 413 })

	const incoming = await request.formData()
	const audio = incoming.get('audio')
	if (!(audio instanceof File)) return new Response('Missing audio', { status: 400 })
	if (audio.size > MAX_BYTES) return new Response('Audio too large', { status: 413 })
	return audio
}

interface TranscriptionProvider {
	apiKey: string | undefined
	missingKeyMessage: string
	url: string
	model: string
}

async function proxyTranscription(request: IRequest, provider: TranscriptionProvider) {
	if (!provider.apiKey) {
		return new Response(provider.missingKeyMessage, { status: 503 })
	}

	const audio = await readAudio(request)
	if (audio instanceof Response) return audio

	const form = new FormData()
	form.append('file', audio, audio.name || 'clip.webm')
	form.append('model', provider.model)
	form.append('response_format', 'json')

	const upstream = await fetch(provider.url, {
		method: 'POST',
		headers: { Authorization: `Bearer ${provider.apiKey}` },
		body: form,
	})

	if (!upstream.ok) {
		const message = await upstream.text()
		return new Response(`Transcription failed: ${message}`, { status: upstream.status })
	}

	const result = (await upstream.json()) as { text?: string }
	return Response.json({ text: result.text ?? '' })
}

/**
 * Speech-to-text proxy: OpenAI.
 *
 * Optional upgrade over the browser's built-in Web Speech API (for Firefox, or
 * better accuracy): forwards a short audio clip to OpenAI's cheapest
 * transcription model (`gpt-4o-mini-transcribe`, roughly $0.003 per minute).
 */
export async function transcribe(request: IRequest, env: Environment) {
	return proxyTranscription(request, {
		apiKey: env.OPENAI_API_KEY,
		missingKeyMessage: 'OPENAI_API_KEY is not set on the worker',
		url: 'https://api.openai.com/v1/audio/transcriptions',
		model: 'gpt-4o-mini-transcribe',
	})
}

/**
 * Speech-to-text proxy: Groq.
 *
 * Forwards a short audio clip to Groq's hosted whisper-large-v3-turbo. Free up
 * to 2,000 requests/day and 28,800 audio-seconds/day, and runs well under a
 * second for push-to-talk-length clips. The default engine for this project.
 */
export async function transcribeGroq(request: IRequest, env: Environment) {
	return proxyTranscription(request, {
		apiKey: env.GROQ_API_KEY,
		missingKeyMessage: 'GROQ_API_KEY is not set on the worker',
		url: 'https://api.groq.com/openai/v1/audio/transcriptions',
		model: 'whisper-large-v3-turbo',
	})
}
