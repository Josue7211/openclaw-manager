import { describe, it, expect } from 'vitest'
import { BUILT_IN_THEMES, getThemeById } from '../theme-definitions'

const REQUIRED_TIER1_KEYS = [
  'bg-base', 'bg-panel', 'bg-card', 'bg-card-hover', 'bg-elevated', 'bg-card-solid',
  'text-primary', 'text-secondary', 'text-muted',
  'border', 'border-hover', 'border-strong', 'border-subtle',
  'glass-bg', 'glass-border',
  'hover-bg', 'hover-bg-bright', 'active-bg',
  'bg-popover', 'bg-modal',
]

const REQUIRED_TIER2_KEYS = [
  'accent', 'accent-dim', 'accent-bright', 'glow-top-rgb',
]

const REQUIRED_STATUS_KEYS = [
  'green', 'red', 'red-500', 'warning',
]

describe('theme-definitions', () => {
  it('BUILT_IN_THEMES has exactly 37 entries', () => {
    expect(BUILT_IN_THEMES).toHaveLength(37)
  })

  it('every preset has a unique id', () => {
    const ids = BUILT_IN_THEMES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset has category matching dark|light|high-contrast|colorful', () => {
    const valid = ['dark', 'light', 'high-contrast', 'colorful']
    for (const theme of BUILT_IN_THEMES) {
      expect(valid).toContain(theme.category)
    }
  })

  it('every preset has builtIn: true', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.builtIn).toBe(true)
    }
  })

  it('every preset colors object contains all required Tier 1 keys', () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const key of REQUIRED_TIER1_KEYS) {
        expect(theme.colors, `Theme "${theme.id}" missing Tier 1 key "${key}"`).toHaveProperty(key)
      }
    }
  })

  it('every preset colors object contains Tier 2 defaults', () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const key of REQUIRED_TIER2_KEYS) {
        expect(theme.colors, `Theme "${theme.id}" missing Tier 2 key "${key}"`).toHaveProperty(key)
      }
    }
  })

  it('every preset colors object contains status color keys', () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const key of REQUIRED_STATUS_KEYS) {
        expect(theme.colors, `Theme "${theme.id}" missing status key "${key}"`).toHaveProperty(key)
      }
    }
  })

  it('getThemeById returns correct preset for known ID', () => {
    const dracula = getThemeById('dracula')
    expect(dracula).toBeDefined()
    expect(dracula!.name).toBe('Dracula')
    expect(dracula!.id).toBe('dracula')
  })

  it('getThemeById returns undefined for unknown ID', () => {
    expect(getThemeById('nonexistent-theme')).toBeUndefined()
  })

  it('dark presets have category dark (14 dark)', () => {
    const dark = BUILT_IN_THEMES.filter(t => t.category === 'dark')
    expect(dark).toHaveLength(14)
  })

  it('light presets have category light (17 light)', () => {
    const light = BUILT_IN_THEMES.filter(t => t.category === 'light')
    expect(light).toHaveLength(17)
  })

  it('colorful presets have category colorful (4 colorful)', () => {
    const colorful = BUILT_IN_THEMES.filter(t => t.category === 'colorful')
    expect(colorful).toHaveLength(4)
  })

  it('high contrast presets have category high-contrast (2)', () => {
    const hc = BUILT_IN_THEMES.filter(t => t.category === 'high-contrast')
    expect(hc).toHaveLength(2)
  })

  it('all color values are non-empty strings', () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const [key, value] of Object.entries(theme.colors)) {
        expect(typeof value, `Theme "${theme.id}" key "${key}" is not a string`).toBe('string')
        expect(value.length, `Theme "${theme.id}" key "${key}" is empty`).toBeGreaterThan(0)
      }
    }
  })
})
