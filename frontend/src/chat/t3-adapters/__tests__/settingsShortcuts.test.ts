import { describe, expect, it } from 'vitest'
import { CHAT_SETTINGS_SHORTCUTS } from '../settingsShortcuts'
import { SETTINGS_SECTION_KEYS } from '@/pages/Settings'

describe('chat settings shortcut adapter', () => {
  it('exposes the required account/settings popover entries', () => {
    expect(CHAT_SETTINGS_SHORTCUTS.map(shortcut => shortcut.label)).toEqual([
      'Settings',
      'Usage remaining',
      'Providers',
      'Codex LB',
    ])
  })

  it('routes every section shortcut to a real settings section', () => {
    const settingsSectionKeys = new Set<string>(SETTINGS_SECTION_KEYS)

    for (const shortcut of CHAT_SETTINGS_SHORTCUTS) {
      if (!shortcut.section) {
        expect(shortcut.href).toBe('/settings')
        continue
      }

      expect(settingsSectionKeys.has(shortcut.section)).toBe(true)
      expect(shortcut.href).toBe(`/settings?section=${shortcut.section}`)
    }
  })
})
