import { useEffect } from 'react'
import { fillFromMapVoice, trackMapVoiceFocusTarget } from './mapVoiceFill'

/** Accept voice dictation from map.html iframe parent via postMessage. */
export function useMapVoiceFill(): void {
  useEffect(() => trackMapVoiceFocusTarget(), [])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; text?: string; requestId?: string } | null
      if (!data || data.type !== 'map-voice-fill' || typeof data.text !== 'string') return

      const ok = fillFromMapVoice(data.text)
      if (data.requestId && window.parent !== window) {
        window.parent.postMessage(
          { type: 'map-voice-fill-result', requestId: data.requestId, ok },
          window.location.origin,
        )
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
}
