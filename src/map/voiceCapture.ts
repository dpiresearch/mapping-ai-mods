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
  const audio = await blobToBase64(blob)
  if (!audio) throw new Error('Empty recording')

  const res = await fetch('/api/voice-transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio,
      mimeType: blob.type || 'audio/webm',
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
