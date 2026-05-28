import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { fillFromMapVoice, resetMapVoiceFillState, trackMapVoiceFocusTarget } from './mapVoiceFill'

describe('fillFromMapVoice', () => {
  let cleanup: () => void

  beforeEach(() => {
    resetMapVoiceFillState()
    document.body.innerHTML = ''
    cleanup = trackMapVoiceFocusTarget()
  })

  afterEach(() => {
    cleanup()
    resetMapVoiceFillState()
  })

  it('fills the last focused input after focus moves away', () => {
    const input = document.createElement('input')
    input.name = 'name'
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    document.body.appendChild(document.createElement('button')).focus()

    expect(fillFromMapVoice('Jane Doe')).toBe(true)
    expect(input.value).toBe('Jane Doe')
  })

  it('appends to existing field value', () => {
    const input = document.createElement('input')
    input.name = 'title'
    input.value = 'CEO'
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    document.body.appendChild(document.createElement('button')).focus()

    expect(fillFromMapVoice('at OpenAI')).toBe(true)
    expect(input.value).toBe('CEO at OpenAI')
  })
})
