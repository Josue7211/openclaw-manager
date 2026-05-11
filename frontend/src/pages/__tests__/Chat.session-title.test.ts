import { describe, expect, it } from 'vitest'
import { deriveSessionTitle, isRepairableSessionLabel } from '../Chat'

describe('chat session title derivation', () => {
  it('skips protocol-test prompts and names from the real request', () => {
    expect(deriveSessionTitle([
      { role: 'user', text: 'helo' },
      { role: 'user', text: 'Reply with exactly COMPAT OK and nothing else' },
      { role: 'assistant', text: 'COMPAT OK' },
      { role: 'assistant', text: 'Weather dashboard widget with 72F current temperature' },
      { role: 'user', text: 'thats just a dashboard widget i meant a whole page' },
    ])).toBe('Weather dashboard page')
  })

  it('falls back to assistant content when user messages are only directives', () => {
    expect(deriveSessionTitle([
      { role: 'user', text: 'Reply with exactly SESSION OK and nothing else' },
      { role: 'assistant', text: 'Weather dashboard widget with 72F current temperature' },
    ])).toBe('Weather dashboard widget')
  })

  it('treats previous directive-derived titles as repairable', () => {
    expect(isRepairableSessionLabel('Reply with exactly COMPAT OK and nothing else')).toBe(true)
    expect(isRepairableSessionLabel('Untitled')).toBe(true)
    expect(isRepairableSessionLabel('helo')).toBe(true)
    expect(isRepairableSessionLabel('Weather dashboard widget')).toBe(false)
  })
})
