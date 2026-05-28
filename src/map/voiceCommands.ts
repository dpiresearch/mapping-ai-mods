/** Voice command parsing and execution for the map UI. */

import { parseShowQuery } from './voiceShowQuery'

type MapEngineVoiceApi = {
  executeVoiceShowQuery?: (spec: ReturnType<typeof parseShowQuery>) => { ok: boolean; message: string }
  clearVoiceShow?: () => void
  setViewMode?: (mode: 'network' | 'plot') => boolean
  setSubView?: (view: 'all' | 'orgs' | 'people' | 'resources') => boolean
}

function getMapEngineVoiceApi(): MapEngineVoiceApi | undefined {
  return (window as Window & { __mapEngine?: MapEngineVoiceApi }).__mapEngine
}

export type VoiceCommandIntent =
  | { type: 'search'; query: string }
  | { type: 'setMode'; mode: 'network' | 'plot' }
  | { type: 'setView'; view: 'all' | 'orgs' | 'people' }
  | { type: 'filterCategory'; label: string; exclusive: boolean }
  | { type: 'filterStance'; label: string }
  | { type: 'filterSource'; source: 'self' | 'connector' | 'external' }
  | { type: 'click'; selector: string; label: string }
  | { type: 'contributeOpen' }
  | { type: 'contributeFill'; text: string }
  | { type: 'clear' }
  | { type: 'help' }
  | { type: 'raw'; text: string }

export function normalizeVoiceText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Utterances starting with "show " are always entity search (per product spec). */
export function parseVoiceCommand(raw: string): VoiceCommandIntent {
  const text = normalizeVoiceText(raw)
  const original = raw.trim()

  if (!text) return { type: 'help' }
  if (text === 'help' || text.includes('what can i say') || text.includes('voice help')) {
    return { type: 'help' }
  }

  if (text.startsWith('show ')) {
    return { type: 'search', query: original.slice(original.toLowerCase().indexOf('show') + 5).trim() }
  }

  if (
    text === 'clear' ||
    text === 'clear search' ||
    text === 'reset filters' ||
    text === 'clear filters' ||
    text === 'reset map'
  ) {
    return { type: 'clear' }
  }

  if (text === 'network' || text.startsWith('switch to network') || text === 'network mode' || text === 'network view') {
    return { type: 'setMode', mode: 'network' }
  }
  if (text === 'plot' || text.startsWith('switch to plot') || text === 'plot mode' || text === 'plot view') {
    return { type: 'setMode', mode: 'plot' }
  }
  if (text === 'all' || text === 'all view' || text === 'all entities') return { type: 'setView', view: 'all' }
  if (text === 'people only' || text === 'people view' || text === 'people') return { type: 'setView', view: 'people' }
  if (text === 'orgs only' || text === 'organizations only' || text === 'orgs view' || text === 'orgs') {
    return { type: 'setView', view: 'orgs' }
  }

  if (text === 'add to map' || text === 'add to the map' || text === 'contribute' || text === 'open contribute') {
    return { type: 'contributeOpen' }
  }

  if (text.startsWith('category ') || text.startsWith('filter ')) {
    const label = text.replace(/^(category|filter)\s+/, '').trim()
    if (label) return { type: 'filterCategory', label, exclusive: true }
  }

  if (text.startsWith('stance ') || text.startsWith('regulatory ')) {
    const label = text.replace(/^(stance|regulatory)\s+/, '').trim()
    if (label) return { type: 'filterStance', label }
  }

  if (text.includes('self-added') || text === 'self added') return { type: 'filterSource', source: 'self' }
  if (text === 'connector') return { type: 'filterSource', source: 'connector' }
  if (text === 'external' || text === 'external source') return { type: 'filterSource', source: 'external' }

  if (text === 'controls' || text === 'open controls') {
    return { type: 'click', selector: '#sidebar-toggle', label: 'Controls' }
  }

  if (text === 'about' || text === 'about this map') {
    return { type: 'click', selector: '.info-btn', label: 'About this map' }
  }

  // Default: treat as a page command (category filter, button, or form fill when panel open).
  return { type: 'raw', text: original }
}

function clickEl(el: HTMLElement | null): boolean {
  if (!el) return false
  el.click()
  return true
}

function chipMatches(chip: Element, needle: string): boolean {
  const label = normalizeVoiceText(chip.textContent || '')
  return label === needle || label.includes(needle) || needle.includes(label)
}

function setExclusiveCategoryFilter(label: string): boolean {
  const chips = Array.from(document.querySelectorAll('#category-chips .chip'))
  if (chips.length === 0) return false
  const needle = normalizeVoiceText(label)
  const match = chips.find((c) => chipMatches(c, needle))
  if (!match) return false

  chips.forEach((chip) => {
    const isMatch = chip === match
    const active = chip.classList.contains('active')
    if (isMatch && !active) (chip as HTMLElement).click()
    if (!isMatch && active) (chip as HTMLElement).click()
  })
  return true
}

function toggleCategoryFilter(label: string): boolean {
  const chips = Array.from(document.querySelectorAll('#category-chips .chip'))
  const needle = normalizeVoiceText(label)
  const match = chips.find((c) => chipMatches(c, needle))
  if (!match) return false
  ;(match as HTMLElement).click()
  return true
}

function filterStance(label: string): boolean {
  const items = Array.from(document.querySelectorAll('#stance-legend-items .stance-legend-item'))
  const needle = normalizeVoiceText(label)
  const match = items.find((item) => {
    const t = normalizeVoiceText(item.textContent || '')
    return t === needle || t.includes(needle) || needle.includes(t)
  })
  if (!match) return false
  if (match.classList.contains('inactive')) (match as HTMLElement).click()
  return true
}

function filterSource(source: 'self' | 'connector' | 'external'): boolean {
  return clickEl(document.querySelector(`#source-type-items .source-type-item[data-source="${source}"]`))
}

function findControlByText(text: string): HTMLElement | null {
  const needle = normalizeVoiceText(text)
  const selectors = [
    '#category-chips .chip',
    '#secondary-category-chips .chip',
    '#stance-legend-items .stance-legend-item',
    '#source-type-items .source-type-item',
    '#plot-sub-tabs .view-btn',
    '#contribute-btn',
    '#sidebar-toggle',
    '.info-btn',
    '.search-run-btn',
    '.search-clear-btn',
  ]
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const label = normalizeVoiceText(el.textContent || '')
      if (label === needle || label.includes(needle) || needle.includes(label)) {
        return el as HTMLElement
      }
    }
  }
  return null
}

export function isContributePanelOpen(): boolean {
  return document.getElementById('contribute-panel')?.classList.contains('open') ?? false
}

export function sendToContributeForm(text: string): boolean {
  if (!isContributePanelOpen()) return false
  const iframe = document.querySelector('#contribute-iframe') as HTMLIFrameElement | null
  if (!iframe?.contentWindow) return false
  iframe.contentWindow.postMessage({ type: 'map-voice-fill', text }, window.location.origin)
  return true
}

/** Post voice text to the contribute iframe and wait for fill confirmation. */
export function sendToContributeFormAsync(text: string): Promise<boolean> {
  if (!isContributePanelOpen()) return Promise.resolve(false)
  const iframe = document.querySelector('#contribute-iframe') as HTMLIFrameElement | null
  if (!iframe?.contentWindow) return Promise.resolve(false)

  const requestId = crypto.randomUUID()
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve(false)
    }, 800)

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; requestId?: string; ok?: boolean } | null
      if (data?.type !== 'map-voice-fill-result' || data.requestId !== requestId) return
      cleanup()
      resolve(Boolean(data.ok))
    }

    function cleanup() {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
    }

    window.addEventListener('message', onMessage)
    iframe.contentWindow!.postMessage({ type: 'map-voice-fill', text, requestId }, window.location.origin)
  })
}

export type VoiceExecuteResult = { ok: boolean; message: string }

export async function executeVoiceCommand(intent: VoiceCommandIntent): Promise<VoiceExecuteResult> {
  const click = (selector: string): boolean => clickEl(document.querySelector(selector) as HTMLElement | null)

  if (intent.type === 'help') {
    return {
      ok: true,
      message:
        'Say "show OpenAI" or "show OpenAI connections that are organizations". Category names filter chips. "Add to map" opens the form.',
    }
  }

  if (intent.type === 'clear') {
    getMapEngineVoiceApi()?.clearVoiceShow?.()
    click('#search-clear-btn')
    return { ok: true, message: 'Cleared search and highlights' }
  }

  if (intent.type === 'setMode') {
    const engine = getMapEngineVoiceApi()
    engine?.clearVoiceShow?.()
    if (engine?.setViewMode?.(intent.mode)) {
      return { ok: true, message: `Switched to ${intent.mode}` }
    }
    const ok = click(`.mode-btn[data-mode="${intent.mode}"]`)
    return { ok, message: ok ? `Switched to ${intent.mode}` : `Could not switch to ${intent.mode}` }
  }

  if (intent.type === 'setView') {
    const engine = getMapEngineVoiceApi()
    engine?.clearVoiceShow?.()
    if (engine?.setSubView?.(intent.view)) {
      return { ok: true, message: `View: ${intent.view}` }
    }
    const ok = click(`#network-sub-tabs [data-view="${intent.view}"]`)
    return { ok, message: ok ? `View: ${intent.view}` : `Could not change view` }
  }

  if (intent.type === 'search') {
    const spec = parseShowQuery(intent.query)
    const engine = getMapEngineVoiceApi()
    if (engine?.executeVoiceShowQuery) {
      return engine.executeVoiceShowQuery(spec)
    }
    const input = document.getElementById('search-input') as HTMLInputElement | null
    if (!input) return { ok: false, message: 'Search unavailable' }
    input.value = intent.query
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
    return { ok: true, message: `Searching for "${intent.query}"` }
  }

  if (intent.type === 'contributeOpen') {
    const ok = click('#contribute-btn')
    return { ok, message: ok ? 'Opened Add to Map' : 'Could not open contribute panel' }
  }

  if (intent.type === 'contributeFill') {
    const filled = await sendToContributeFormAsync(intent.text)
    return { ok: filled, message: filled ? 'Added to focused field' : 'Open Add to Map and focus a field first' }
  }

  if (intent.type === 'filterCategory') {
    const ok = intent.exclusive
      ? setExclusiveCategoryFilter(intent.label)
      : toggleCategoryFilter(intent.label)
    return { ok, message: ok ? `Category: ${intent.label}` : `Category not found: ${intent.label}` }
  }

  if (intent.type === 'filterStance') {
    const ok = filterStance(intent.label)
    return { ok, message: ok ? `Stance: ${intent.label}` : `Stance not found: ${intent.label}` }
  }

  if (intent.type === 'filterSource') {
    const ok = filterSource(intent.source)
    return { ok, message: ok ? `Source: ${intent.source}` : 'Source filter not found' }
  }

  if (intent.type === 'click') {
    const ok = click(intent.selector) || clickEl(findControlByText(intent.label))
    return { ok, message: ok ? `Activated: ${intent.label}` : `Control not found: ${intent.label}` }
  }

  // Raw command: contribute form if panel open, else category, else any control, else search fallback
  if (intent.type === 'raw') {
    const text = intent.text.trim()
    if (!text) return { ok: false, message: 'No command heard' }

    if (isContributePanelOpen()) {
      const filled = await sendToContributeFormAsync(text)
      if (filled) {
        return { ok: true, message: 'Added to focused field' }
      }
    }

    if (setExclusiveCategoryFilter(text)) {
      return { ok: true, message: `Category filter: ${text}` }
    }

    const control = findControlByText(text)
    if (control) {
      control.click()
      return { ok: true, message: `Activated: ${control.textContent?.trim() || text}` }
    }

    if (normalizeVoiceText(text) === 'add to map') {
      return executeVoiceCommand({ type: 'contributeOpen' })
    }

    return executeVoiceCommand({ type: 'search', query: text })
  }

  return { ok: false, message: 'Unknown command' }
}
