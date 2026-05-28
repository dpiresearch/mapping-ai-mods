const RECORD_MS = 6000

function pickRecorderMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function canUseVoiceCapture(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.MediaRecorder &&
      navigator.mediaDevices?.getUserMedia,
  )
}

/** Decode recorded blob to PCM16 mono 24 kHz for OpenAI Realtime API. */
async function blobToPcm16Mono24k(blob: Blob): Promise<ArrayBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext({ sampleRate: 24000 })
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
    const durationSec = decoded.duration
    const length = Math.max(1, Math.ceil(durationSec * 24000))
    const offline = new OfflineAudioContext(1, length, 24000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start(0)
    const rendered = await offline.startRendering()
    const channel = rendered.getChannelData(0)
    const pcm = new Int16Array(channel.length)
    for (let i = 0; i < channel.length; i++) {
      const sample = Math.max(-1, Math.min(1, channel[i] ?? 0))
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    return pcm.buffer
  } finally {
    await audioCtx.close()
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
      resolve(base64 || '')
    }
    reader.onerror = () => reject(new Error('Failed to encode audio'))
    reader.readAsDataURL(blob)
  })
}

export type VoiceRecorderSession = {
  stop: () => void
}

/** Record from mic until stop() is called or maxDurationMs elapses. */
export function startVoiceRecording(
  onMaxDuration?: () => void,
  maxDurationMs = RECORD_MS,
): Promise<{ session: VoiceRecorderSession; blob: Promise<Blob> }> {
  return navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    const mimeType = pickRecorderMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    let stopResolve: (blob: Blob) => void
    let stopReject: (err: Error) => void
    const blobPromise = new Promise<Blob>((resolve, reject) => {
      stopResolve = resolve
      stopReject = reject
    })

    const finish = () => {
      clearTimeout(timer)
      stream.getTracks().forEach((t) => t.stop())
      const type = recorder.mimeType || mimeType || 'audio/webm'
      stopResolve(new Blob(chunks, { type }))
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = finish
    recorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop())
      stopReject(new Error('Recording failed'))
    }

    const timer = window.setTimeout(() => {
      onMaxDuration?.()
      if (recorder.state === 'recording') recorder.stop()
    }, maxDurationMs)

    // Timesliced chunks improve reliability when stop() is called quickly.
    recorder.start(250)

    return {
      session: {
        stop: () => {
          if (recorder.state === 'recording') {
            try {
              recorder.requestData()
            } catch {
              // requestData unsupported in some browsers
            }
            recorder.stop()
          }
        },
      },
      blob: blobPromise,
    }
  })
}

export async function transcribeVoiceBlob(blob: Blob): Promise<string> {
  const pcmBuffer = await blobToPcm16Mono24k(blob)
  const audio = arrayBufferToBase64(pcmBuffer)
  if (!audio) throw new Error('Empty recording')

  const res = await fetch('/api/voice-transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio,
      mimeType: 'audio/pcm',
      sampleRate: 24000,
    }),
  })

  const data = (await res.json()) as { text?: string; error?: string; hint?: string }
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error(data.hint || data.error || 'Add OPENAI_API_KEY to .env and restart the dev server')
    }
    throw new Error(data.error || 'Transcription failed')
  }
  return (data.text || '').trim()
}
