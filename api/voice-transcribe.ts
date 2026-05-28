/**
 * Map voice command transcription — Realtime (gpt-realtime-2) or Whisper (whisper-1).
 *
 * Set VOICE_TRANSCRIBE_BACKEND=whisper to use the legacy Whisper REST path.
 * Default: realtime (VOICE_REALTIME_MODEL=gpt-realtime-2).
 */
import { transcribeWithRealtime } from './voice-realtime.ts'

export type VoiceTranscribeBackend = 'realtime' | 'whisper'

export function getVoiceTranscribeBackend(): VoiceTranscribeBackend {
  const v = process.env.VOICE_TRANSCRIBE_BACKEND?.trim().toLowerCase()
  if (v === 'whisper') return 'whisper'
  return 'realtime'
}

/** Legacy Whisper REST transcription (whisper-1). Kept for easy rollback. */
export async function transcribeWithWhisper(
  audioBytes: Uint8Array,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const isPcm = mimeType.includes('pcm')
  const ext = isPcm ? 'wav' : mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'wav'
  const fileType = isPcm ? 'audio/wav' : mimeType
  const formData = new FormData()
  const bytes = new Uint8Array(audioBytes)
  formData.append('file', new Blob([bytes], { type: fileType }), `audio.${ext}`)
  formData.append('model', 'whisper-1')
  formData.append('language', 'en')

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Whisper API ${resp.status}: ${errText.slice(0, 200)}`)
  }

  const json = (await resp.json()) as { text?: string }
  return (json.text || '').trim()
}

/** Route to Realtime or Whisper based on VOICE_TRANSCRIBE_BACKEND. */
export async function transcribeVoiceAudio(
  audioBytes: Uint8Array,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const backend = getVoiceTranscribeBackend()
  if (backend === 'whisper') {
    return transcribeWithWhisper(audioBytes, mimeType, apiKey)
  }

  if (!mimeType.includes('pcm')) {
    throw new Error('Realtime backend requires PCM16 audio (audio/pcm)')
  }

  const model = process.env.VOICE_REALTIME_MODEL?.trim() || 'gpt-realtime-2'
  return transcribeWithRealtime(audioBytes, apiKey, { model })
}

/** Map OpenAI errors to user-facing messages (no secrets). */
export function voiceTranscribeClientError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('401')) {
    return 'Invalid OpenAI API key. Check OPENAI_API_KEY in .env and restart dev.'
  }
  if (msg.includes('429')) {
    return 'OpenAI rate limit exceeded. Try again in a moment.'
  }
  if (msg.includes('413')) {
    return 'Recording too large. Speak a shorter command.'
  }
  if (msg.includes('400')) {
    return 'Audio could not be processed. Try recording again.'
  }
  if (msg.includes('timed out')) {
    return 'Voice transcription timed out. Try a shorter command.'
  }
  if (msg.includes('Missing required parameter') || msg.includes('invalid')) {
    return msg.length < 160 ? msg : 'Realtime session configuration error'
  }
  // Surface short API messages (e.g. "Incorrect API key") to the UI
  if (msg.length > 0 && msg.length < 160 && !msg.includes('Whisper API')) {
    return msg
  }
  return 'Transcription failed'
}

/** @deprecated Use voiceTranscribeClientError */
export const whisperClientError = voiceTranscribeClientError

export function decodeBase64Audio(audioBase64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(audioBase64, 'base64'))
  }
  const binary = atob(audioBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
