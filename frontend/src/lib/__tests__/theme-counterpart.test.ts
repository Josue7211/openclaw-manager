/**
 * Tests for dark<->light counterpart auto-switch behavior.
 *
 * Covers COUNTERPART_MAP data integrity and setMode() auto-switch logic.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { COUNTERPART_MAP } from '../theme-definitions'
import { setMode, getThemeState, setActiveTheme } from '../theme-store'

// ---------------------------------------------------------------------------
// COUNTERPART_MAP data tests
// ---------------------------------------------------------------------------

describe('COUNTERPART_MAP', () => {
  it('has 36 entries (18 bidirectional pairs)', () => {
    expect(Object.keys(COUNTERPART_MAP)).toHaveLength(36)
  })

  it('is fully bidirectional', () => {
    for (const [key, val] of Object.entries(COUNTERPART_MAP)) {
      expect(COUNTERPART_MAP[val], `${val} should map back to ${key}`).toBe(key)
    }
  })

  it('contains all 18 expected pairs', () => {
    const expectedPairs = [
      // Original 5 pairs
      ['default-dark', 'default-light'],
      ['gruvbox-dark', 'gruvbox-light'],
      ['catppuccin-mocha', 'catppuccin-latte'],
      ['solarized-dark', 'solarized-light'],
      ['high-contrast-dark', 'high-contrast-light'],
      // New 13 pairs
      ['dracula', 'dracula-light'],
      ['nord', 'nord-light'],
      ['rose-pine', 'rose-pine-light'],
      ['tokyo-night', 'tokyo-night-light'],
      ['graphite-mono', 'graphite-mono-light'],
      ['decay-green', 'decay-green-light'],
      ['edge-runner', 'edge-runner-light'],
      ['synth-wave', 'synth-wave-light'],
      ['material-sakura', 'material-sakura-dark'],
      ['terminal', 'terminal-light'],
      ['monster-high', 'monster-high-light'],
      ['purple-mode', 'purple-mode-light'],
      ['pink-mode', 'pink-mode-light'],
    ]
    for (const [dark, light] of expectedPairs) {
      expect(COUNTERPART_MAP[dark], `${dark} -> ${light}`).toBe(light)
      expect(COUNTERPART_MAP[light], `${light} -> ${dark}`).toBe(dark)
    }
  })
})

// ---------------------------------------------------------------------------
// setMode auto-switch behavior tests
// ---------------------------------------------------------------------------

describe('setMode auto-switch', () => {
  beforeEach(() => {
    // Reset to a known state before each test
    localStorage.clear()
    localStorage.setItem('theme-state', JSON.stringify({
      mode: 'dark',
      activeThemeId: 'default-dark',
      overrides: {},
      customThemes: [],
    }))
    // Force re-initialization by importing the module fresh
    // Since modules are cached, we use setActiveTheme + setMode to set up state
  })

  // --- Original counterpart pairs: dark -> light ---

  it('gruvbox-dark -> gruvbox-light when switching dark to light', () => {
    setActiveTheme('gruvbox-dark')
    setMode('dark') // ensure we're in dark mode first
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('gruvbox-light')
    expect(getThemeState().mode).toBe('light')
  })

  it('gruvbox-light -> gruvbox-dark when switching light to dark', () => {
    setActiveTheme('gruvbox-light')
    setMode('light') // ensure we're in light mode first
    setMode('dark')
    expect(getThemeState().activeThemeId).toBe('gruvbox-dark')
    expect(getThemeState().mode).toBe('dark')
  })

  it('catppuccin-mocha -> catppuccin-latte when switching dark to light', () => {
    setActiveTheme('catppuccin-mocha')
    setMode('dark')
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('catppuccin-latte')
  })

  it('catppuccin-latte -> catppuccin-mocha when switching light to dark', () => {
    setActiveTheme('catppuccin-latte')
    setMode('light')
    setMode('dark')
    expect(getThemeState().activeThemeId).toBe('catppuccin-mocha')
  })

  it('solarized-dark -> solarized-light when switching dark to light', () => {
    setActiveTheme('solarized-dark')
    setMode('dark')
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('solarized-light')
  })

  it('solarized-light -> solarized-dark when switching light to dark', () => {
    setActiveTheme('solarized-light')
    setMode('light')
    setMode('dark')
    expect(getThemeState().activeThemeId).toBe('solarized-dark')
  })

  it('default-dark -> default-light when switching dark to light', () => {
    setActiveTheme('default-dark')
    setMode('dark')
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('default-light')
  })

  it('default-light -> default-dark when switching light to dark', () => {
    setActiveTheme('default-light')
    setMode('light')
    setMode('dark')
    expect(getThemeState().activeThemeId).toBe('default-dark')
  })

  it('high-contrast-dark -> high-contrast-light when switching dark to light', () => {
    setActiveTheme('high-contrast-dark')
    setMode('dark')
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('high-contrast-light')
  })

  it('high-contrast-light -> high-contrast-dark when switching light to dark', () => {
    setActiveTheme('high-contrast-light')
    setMode('light')
    setMode('dark')
    expect(getThemeState().activeThemeId).toBe('high-contrast-dark')
  })

  // --- New counterpart pairs ---

  it('dracula -> dracula-light when switching dark to light', () => {
    setActiveTheme('dracula')
    setMode('dark')
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('dracula-light')
  })

  it('dracula-light -> dracula when switching light to dark', () => {
    setActiveTheme('dracula-light')
    setMode('light')
    setMode('dark')
    expect(getThemeState().activeThemeId).toBe('dracula')
  })

  it('rose-pine -> rose-pine-light when switching dark to light', () => {
    // Use system as bridge to set mode without triggering counterpart
    setActiveTheme('rose-pine')
    setMode('system')
    setMode('dark')
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('rose-pine-light')
  })

  it('tokyo-night -> tokyo-night-light when switching dark to light', () => {
    setActiveTheme('tokyo-night')
    setMode('system')
    setMode('dark')
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('tokyo-night-light')
  })

  it('material-sakura -> material-sakura-dark when switching light to dark', () => {
    setActiveTheme('material-sakura')
    setMode('system')
    setMode('light')
    setMode('dark')
    expect(getThemeState().activeThemeId).toBe('material-sakura-dark')
  })

  it('terminal -> terminal-light when switching dark to light', () => {
    setActiveTheme('terminal')
    setMode('system')
    setMode('dark')
    setMode('light')
    expect(getThemeState().activeThemeId).toBe('terminal-light')
  })

  // --- System mode: no auto-switch ---

  it('setMode("system") does NOT auto-switch theme', () => {
    setActiveTheme('gruvbox-dark')
    setMode('system') // bridge to avoid counterpart
    setMode('dark')   // system->dark does NOT trigger counterpart
    setMode('system') // dark->system does NOT trigger counterpart
    expect(getThemeState().activeThemeId).toBe('gruvbox-dark')
  })

  it('switching from system to dark does NOT auto-switch', () => {
    setActiveTheme('gruvbox-light')
    setMode('system')
    setMode('dark')
    // system -> dark should NOT trigger counterpart logic
    expect(getThemeState().activeThemeId).toBe('gruvbox-light')
  })

  it('switching from system to light does NOT auto-switch', () => {
    setActiveTheme('gruvbox-dark')
    setMode('system')
    setMode('light')
    // system -> light should NOT trigger counterpart logic
    expect(getThemeState().activeThemeId).toBe('gruvbox-dark')
  })

  // --- Same mode: no switch ---

  it('setMode("dark") when already dark does NOT change theme', () => {
    // First ensure we are solidly in dark mode with gruvbox-dark
    setActiveTheme('gruvbox-dark')
    // Force mode to dark without triggering counterpart by using system as bridge
    setMode('system')
    setMode('dark') // system->dark does NOT auto-switch (per design)
    expect(getThemeState().activeThemeId).toBe('gruvbox-dark')
    // Now calling dark again should be a no-op
    setMode('dark')
    expect(getThemeState().activeThemeId).toBe('gruvbox-dark')
  })
})
