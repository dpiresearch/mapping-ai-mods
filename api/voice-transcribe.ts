/**
 * Shared OpenAI Whisper transcription for map voice commands.
 * Used by functions/api/voice-transcribe.ts and dev-server.js.
 */

export async function transcribeWithWhisper(
  audioBytes: Uint8Array,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'wav'
  const formData = new FormData()
  const bytes = new Uint8Array(audioBytes)
  formData.append('file', new Blob([bytes], { type: mimeType }), `audio.${ext}`)
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

/** Map Whisper/OpenAI errors to user-facing messages (no secrets). */
export function whisperClientError(err: unknown): string {
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
  return 'Transcription failed'
}

export function decodeBase64Audio(audioBase64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(audioBase64, 'base64'))
  }
  const binary = atob(audioBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
