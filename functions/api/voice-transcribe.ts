/**
 * POST /api/voice-transcribe
 *
 * Transcribes short voice commands via OpenAI Whisper (server-side).
 * Body: JSON { audio: base64, mimeType?: string } or multipart form with "file".
 */
import type { Env } from './_shared/env.ts'
import { jsonResponse, optionsResponse } from './_shared/cors.ts'
import {
  decodeBase64Audio,
  transcribeVoiceAudio,
  voiceTranscribeClientError,
  getVoiceTranscribeBackend,
} from '../../api/voice-transcribe.ts'

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return optionsResponse(request, {
      methods: 'POST, OPTIONS',
      headers: 'Content-Type',
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, request, 405)
  }

  const apiKey = env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return jsonResponse(
      {
        error: 'Voice transcription not configured',
        hint: 'Set OPENAI_API_KEY in Cloudflare environment variables',
      },
      request,
      503,
    )
  }

  let audioBytes: Uint8Array
  let mimeType = 'audio/webm'
  const contentType = request.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { audio?: string; mimeType?: string }
      if (!body.audio) return jsonResponse({ error: 'Missing audio' }, request, 400)
      mimeType = body.mimeType || mimeType
      audioBytes = decodeBase64Audio(body.audio)
    } else {
      const formData = await request.formData()
      const file = formData.get('file')
      if (!(file instanceof File)) return jsonResponse({ error: 'Missing file' }, request, 400)
      mimeType = file.type || mimeType
      audioBytes = new Uint8Array(await file.arrayBuffer())
    }

    if (audioBytes.length === 0) {
      return jsonResponse({ error: 'Empty audio' }, request, 400)
    }
    if (audioBytes.length > 12 * 1024 * 1024) {
      return jsonResponse({ error: 'Audio too large (max 12MB)' }, request, 413)
    }

    const text = await transcribeVoiceAudio(audioBytes, mimeType, apiKey)
    return jsonResponse({ text, backend: getVoiceTranscribeBackend() }, request)
  } catch (err) {
    console.error('voice-transcribe error:', err)
    return jsonResponse({ error: voiceTranscribeClientError(err) }, request, 500)
  }
}
