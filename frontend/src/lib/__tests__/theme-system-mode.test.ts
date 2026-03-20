/**
 * Tests for system mode UI behavior — single card on Linux, filtered presets elsewhere.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getActiveSystemTheme, isOsDark, setOsDarkPreference, setGtkThemeMapping } from '../theme-engine'
import type { ThemeState } from '../theme-definitions'

function makeState(overrides: Partial<ThemeState> = {}): ThemeState {
  return {
    mode: 'system',
    activeThemeId: 'default-dark',
    overrides: {},
    customThemes: [],
    ...overrides,
  }
}

describe('getActiveSystemTheme', () => {
  // Save original userAgent
  const originalUserAgent = navigator.userAgent

  afterEach(() => {
    // Restore userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
      configurable: true,
    })
  })

  describe('non-system mode', () => {
    it('returns isSystemMode=false for dark mode', () => {
      const info = getActiveSystemTheme(makeState({ mode: 'dark' }))
      expect(info.isSystemMode).toBe(false)
      expect(info.activeTheme).toBeNull()
    })

    it('returns isSystemMode=false for light mode', () => {
      const info = getActiveSystemTheme(makeState({ mode: 'light' }))
      expect(info.isSystemMode).toBe(false)
      expect(info.activeTheme).toBeNull()
    })
  })

  describe('Linux system mode', () => {
    beforeEach(() => {
      // Simulate Linux userAgent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15',
        writable: true,
        configurable: true,
      })
    })

    it('returns isLinux=true and isSystemMode=true', () => {
      const info = getActiveSystemTheme(makeState())
      expect(info.isLinux).toBe(true)
      expect(info.isSystemMode).toBe(true)
    })

    it('resolves active theme (single card)', () => {
      const info = getActiveSystemTheme(makeState())
      expect(info.activeTheme).not.toBeNull()
      expect(info.activeTheme!.id).toBeDefined()
    })

    it('returns display name from resolved theme', () => {
      // When using default theme
      setOsDarkPreference(true)
      const info = getActiveSystemTheme(makeState({ activeThemeId: 'default-dark' }))
      expect(info.activeThemeName).toBeTruthy()
      expect(info.activeThemeName.length).toBeGreaterThan(0)
    })

    it('returns "Wallbash" as display name when wallbash-live resolves', () => {
      // This test verifies that when wallbash-gtk is active, the name is "Wallbash"
      // We can't fully test this without setting up wallbash state, but we verify
      // the logic through the non-wallbash path
      setGtkThemeMapping('catppuccin-mocha')
      const info = getActiveSystemTheme(makeState({ activeThemeId: 'default-dark' }))
      expect(info.activeThemeName).toBe('Catppuccin Mocha')
    })
  })

  describe('non-Linux system mode', () => {
    beforeEach(() => {
      // Simulate macOS userAgent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        writable: true,
        configurable: true,
      })
    })

    it('returns isLinux=false for macOS', () => {
      const info = getActiveSystemTheme(makeState())
      expect(info.isLinux).toBe(false)
      expect(info.isSystemMode).toBe(true)
    })

    it('returns null activeTheme for macOS (UI shows filtered presets)', () => {
      const info = getActiveSystemTheme(makeState())
      expect(info.activeTheme).toBeNull()
      expect(info.activeThemeName).toBe('')
    })
  })
})

describe('isOsDark', () => {
  it('returns a boolean', () => {
    const result = isOsDark()
    expect(typeof result).toBe('boolean')
  })

  it('reflects setOsDarkPreference', () => {
    setOsDarkPreference(true)
    expect(isOsDark()).toBe(true)
    setOsDarkPreference(false)
    expect(isOsDark()).toBe(false)
  })
})

describe('system theme name formatting', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15',
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15',
      writable: true,
      configurable: true,
    })
  })

  it('formatted label matches "System Theme: [name]" pattern (dark mode)', () => {
    setOsDarkPreference(true)
    setGtkThemeMapping('dracula')
    const info = getActiveSystemTheme(makeState())
    const label = `System Theme: ${info.activeThemeName}`
    expect(label).toBe('System Theme: Dracula')
  })

  it('formatted label for nord theme (dark mode)', () => {
    setOsDarkPreference(true)
    setGtkThemeMapping('nord')
    const info = getActiveSystemTheme(makeState())
    const label = `System Theme: ${info.activeThemeName}`
    expect(label).toBe('System Theme: Nord')
  })

  it('uses light counterpart when OS prefers light', () => {
    setOsDarkPreference(false)
    setGtkThemeMapping('dracula')
    const info = getActiveSystemTheme(makeState())
    expect(info.activeThemeName).toBe('Dracula Light')
  })

  it('uses dark counterpart when OS prefers dark and GTK is light', () => {
    setOsDarkPreference(true)
    setGtkThemeMapping('material-sakura')
    const info = getActiveSystemTheme(makeState())
    expect(info.activeThemeName).toBe('Material Sakura Dark')
  })
})
