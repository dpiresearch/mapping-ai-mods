/**
 * OpenAI Realtime API transcription via gpt-realtime-2.
 *
 * Connects with ?model=gpt-realtime-2 (a "realtime" session, not ?intent=transcription).
 * Configures input transcription + no assistant response (manual audio buffer commit).
 */

export interface RealtimeTranscribeOptions {
  /** WebSocket connection model (default gpt-realtime-2). */
  model?: string
  /** STT model inside the transcription session (default gpt-realtime-whisper). */
  transcriptionModel?: string
  language?: string
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function parseMessage(data: string | ArrayBuffer | Blob): Record<string, unknown> {
  const text = typeof data === 'string' ? data : ''
  if (!text && data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>
  }
  return JSON.parse(text) as Record<string, unknown>
}

/** Transcribe PCM16 mono audio (24 kHz) via Realtime API. */
export async function transcribeWithRealtime(
  pcmBytes: Uint8Array,
  apiKey: string,
  options: RealtimeTranscribeOptions = {},
): Promise<string> {
  const model = options.model || process.env.VOICE_REALTIME_MODEL?.trim() || 'gpt-realtime-2'
  const transcriptionModel =
    options.transcriptionModel ||
    process.env.VOICE_REALTIME_TRANSCRIPTION_MODEL?.trim() ||
    'gpt-realtime-whisper'
  const language = options.language || 'en'
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`

  type WsCtor = new (
    url: string,
    protocolsOrOptions?: string | string[] | { headers?: Record<string, string> },
  ) => WebSocket
  const WebSocketImpl = WebSocket as WsCtor

  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    let transcript = ''
    let audioSent = false
    let settled = false

    const finish = (err?: Error, text?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // ignore
      }
      if (err) reject(err)
      else resolve((text ?? transcript).trim())
    }

    const timer = setTimeout(() => {
      finish(new Error('Realtime transcription timed out'))
    }, 45_000)

    const sendAudio = () => {
      if (audioSent) return
      audioSent = true
      const chunkBytes = 4800 * 2 // ~100 ms at 24 kHz PCM16
      for (let i = 0; i < pcmBytes.length; i += chunkBytes) {
        const slice = pcmBytes.subarray(i, i + chunkBytes)
        ws.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: toBase64(slice),
          }),
        )
      }
      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    }

    ws.addEventListener('open', () => {
      // Must use session.type "realtime" when connecting with ?model=gpt-realtime-2.
      // type "transcription" is only valid for ?intent=transcription sessions.
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            model,
            output_modalities: ['text'],
            instructions:
              'Transcribe the user audio only. Do not speak and do not send a conversational reply.',
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                transcription: { model: transcriptionModel, language },
                turn_detection: null,
              },
            },
          },
        }),
      )
    })

    ws.addEventListener('message', (event) => {
      let msg: Record<string, unknown>
      try {
        msg = parseMessage(event.data as string)
      } catch {
        return
      }

      const type = msg.type as string | undefined

      if (type === 'session.created' || type === 'session.updated') {
        sendAudio()
        return
      }

      if (
        type === 'conversation.item.input_audio_transcription.completed' ||
        type === 'input_audio_buffer.transcription.completed'
      ) {
        transcript = (msg.transcript as string) || transcript
        finish(undefined, transcript)
        return
      }

      // Ignore assistant response events — we only want the input transcript.
      if (type?.startsWith('response.')) return

      if (type === 'error' || type === 'response.error') {
        const errObj = (msg.error || msg) as { message?: string; code?: string } | undefined
        const detail = errObj?.message || (msg as { message?: string }).message
        finish(new Error(detail || 'Realtime API error'))
      }
    })

    ws.addEventListener('error', () => {
      finish(new Error('Realtime WebSocket connection failed'))
    })

    ws.addEventListener('close', () => {
      if (!settled) {
        if (transcript) finish(undefined, transcript)
        else finish(new Error('Realtime connection closed without transcription'))
      }
    })
  })
}
