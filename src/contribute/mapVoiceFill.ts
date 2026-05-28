/** Voice dictation into contribute form fields (map iframe). */

let lastFocusedInput: HTMLInputElement | HTMLTextAreaElement | null = null
let lastFocusedEditor: HTMLElement | null = null

function isFillableInput(el: Element): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    el.type !== 'hidden' &&
    el.type !== 'checkbox' &&
    el.type !== 'radio' &&
    !el.disabled &&
    el.name !== '_hp'
  )
}

export function trackMapVoiceFocusTarget(): () => void {
  function onFocusIn(event: FocusEvent) {
    const target = event.target
    if (!target || !(target instanceof Element)) return
    if (isFillableInput(target)) {
      lastFocusedInput = target
      lastFocusedEditor = null
      return
    }
    if (target instanceof HTMLTextAreaElement && !target.disabled) {
      lastFocusedInput = target
      lastFocusedEditor = null
      return
    }
    const editor = target instanceof HTMLElement ? target.closest('.ProseMirror') : null
    if (editor instanceof HTMLElement) {
      lastFocusedEditor = editor
    }
  }

  document.addEventListener('focusin', onFocusIn, true)
  return () => document.removeEventListener('focusin', onFocusIn, true)
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function appendToField(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const sep = el.value && !el.value.endsWith(' ') ? ' ' : ''
  setNativeValue(el, `${el.value}${sep}${text}`)
}

function resolveTargetField(): HTMLInputElement | HTMLTextAreaElement | null {
  const active = document.activeElement
  if (active instanceof Element && isFillableInput(active)) return active
  if (active instanceof HTMLTextAreaElement && !active.disabled) return active
  if (lastFocusedInput && document.contains(lastFocusedInput)) return lastFocusedInput
  return null
}

function fillContentEditable(editor: HTMLElement, text: string): boolean {
  editor.focus()
  const trimmed = text.trim()
  if (!trimmed) return false
  try {
    return document.execCommand('insertText', false, trimmed)
  } catch {
    editor.textContent = (editor.textContent || '') + (editor.textContent ? ' ' : '') + trimmed
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }
}

/**
 * Insert transcribed text into the focused contribute field.
 * Returns false if no suitable target was found.
 */
export function fillFromMapVoice(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  const target = resolveTargetField()
  if (target) {
    appendToField(target, trimmed)
    target.focus()
    return true
  }

  if (lastFocusedEditor && document.contains(lastFocusedEditor)) {
    return fillContentEditable(lastFocusedEditor, trimmed)
  }

  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), textarea:not([disabled])',
  )
  for (const el of fields) {
    if (el.name === '_hp' || el.offsetParent === null) continue
    el.focus()
    appendToField(el, trimmed)
    return true
  }

  return false
}

/** For tests */
export function resetMapVoiceFillState(): void {
  lastFocusedInput = null
  lastFocusedEditor = null
}
