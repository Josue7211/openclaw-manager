import { describe, expect, it } from 'vitest'
import {
  decodeProjectScriptKeybindingRule,
  keybindingValueForCommand,
} from '../projectScriptKeybindings'

describe('T3 copied project script keybinding helpers', () => {
  it('decodes non-empty keybindings into command rules', () => {
    expect(decodeProjectScriptKeybindingRule({
      keybinding: 'mod+shift+t',
      command: 'script.test-chat.run',
    })).toEqual({
      key: 'mod+shift+t',
      command: 'script.test-chat.run',
    })
    expect(decodeProjectScriptKeybindingRule({
      keybinding: '   ',
      command: 'script.test-chat.run',
    })).toBeNull()
  })

  it('returns the most recent keybinding value for a command', () => {
    expect(keybindingValueForCommand([
      { key: 'mod+t', command: 'script.test-chat.run' },
      {
        key: 'ignored',
        command: 'script.test-chat.run',
        shortcut: { modKey: true, shiftKey: true, key: 't' },
      },
    ], 'script.test-chat.run')).toBe('mod+shift+t')
  })
})
