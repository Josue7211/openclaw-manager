import { describe, it, expect } from 'vitest'
import { getThemeById } from '../theme-definitions'
import type { ThemeDefinition, ThemeState } from '../theme-definitions'
import {
  parseColor,
  formatColor,
  contrastRatio,
  interpolateThemes,
} from '../theme-engine'

// Use REAL theme data — no mocks
const darkDef = getThemeById('default-dark') as ThemeDefinition
const lightDef = getThemeById('default-light') as ThemeDefinition

// Tier 2 keys that must NEVER appear in interpolation output
const TIER_2_KEYS = [
  'accent', 'accent-dim', 'accent-bright', 'glow-top-rgb',
  'green', 'red', 'red-500', 'warning',
]

describe('theme blend interpolation', () => {
  describe('parseColor', () => {
    it('parses #ff0000 to [255, 0, 0, 1]', () => {
      expect(parseColor('#ff0000')).toEqual([255, 0, 0, 1])
    })

    it('parses #000000 to [0, 0, 0, 1]', () => {
      expect(parseColor('#000000')).toEqual([0, 0, 0, 1])
    })

    it('parses rgba(255, 128, 0, 0.5) correctly', () => {
      expect(parseColor('rgba(255, 128, 0, 0.5)')).toEqual([255, 128, 0, 0.5])
    })

    it('parses rgba(0, 0, 0, 0.06) correctly', () => {
      expect(parseColor('rgba(0, 0, 0, 0.06)')).toEqual([0, 0, 0, 0.06])
    })

    it('parses #1e1e1e to [30, 30, 30, 1]', () => {
      expect(parseColor('#1e1e1e')).toEqual([30, 30, 30, 1])
    })
  })

  describe('formatColor', () => {
    it('formats opaque color as hex', () => {
      expect(formatColor(255, 0, 0, 1)).toBe('#ff0000')
    })

    it('formats semi-transparent color as rgba', () => {
      expect(formatColor(255, 128, 0, 0.5)).toBe('rgba(255, 128, 0, 0.5)')
    })

    it('formats low-alpha color as rgba', () => {
      expect(formatColor(0, 0, 0, 0.06)).toBe('rgba(0, 0, 0, 0.06)')
    })
  })

  describe('contrastRatio', () => {
    it('returns ~21.0 for black on white', () => {
      const ratio = contrastRatio('#000000', '#ffffff')
      expect(ratio).toBeGreaterThan(20.5)
      expect(ratio).toBeLessThan(21.5)
    })

    it('returns ~21.0 for white on black (symmetric)', () => {
      const ratio = contrastRatio('#ffffff', '#000000')
      expect(ratio).toBeGreaterThan(20.5)
      expect(ratio).toBeLessThan(21.5)
    })

    it('returns between 4.0 and 5.0 for #777777 on #ffffff', () => {
      const ratio = contrastRatio('#777777', '#ffffff')
      expect(ratio).toBeGreaterThan(4.0)
      expect(ratio).toBeLessThan(5.0)
    })
  })

  describe('interpolateThemes', () => {
    it('returns dark theme Tier 1 values unchanged at t=0', () => {
      const result = interpolateThemes(darkDef, lightDef, 0)
      expect(result['bg-base']).toBe(darkDef.colors['bg-base'])
      expect(result['border-subtle']).toBe(darkDef.colors['border-subtle'])
      expect(result['bg-card-solid']).toBe(darkDef.colors['bg-card-solid'])
    })

    it('returns light theme Tier 1 values unchanged at t=1', () => {
      const result = interpolateThemes(darkDef, lightDef, 1)
      expect(result['bg-base']).toBe(lightDef.colors['bg-base'])
      expect(result['border-subtle']).toBe(lightDef.colors['border-subtle'])
      expect(result['bg-card-solid']).toBe(lightDef.colors['bg-card-solid'])
    })

    it('returns mid-blend values different from both endpoints at t=0.5', () => {
      const result = interpolateThemes(darkDef, lightDef, 0.5)
      expect(result['bg-base']).not.toBe(darkDef.colors['bg-base'])
      expect(result['bg-base']).not.toBe(lightDef.colors['bg-base'])
    })

    it('never includes Tier 2 keys in output', () => {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const result = interpolateThemes(darkDef, lightDef, t)
        for (const key of TIER_2_KEYS) {
          expect(result).not.toHaveProperty(key)
        }
      }
    })

    it('auto-switches text-primary for WCAG AA contrast at t=0.5', () => {
      const result = interpolateThemes(darkDef, lightDef, 0.5)
      const ratio = contrastRatio(result['text-primary'], result['bg-base'])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('maintains WCAG AA contrast for text-primary vs bg-base at all blend positions', () => {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const result = interpolateThemes(darkDef, lightDef, t)
        const ratio = contrastRatio(result['text-primary'], result['bg-base'])
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('maintains WCAG AA contrast for text-secondary vs bg-base at all blend positions', () => {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const result = interpolateThemes(darkDef, lightDef, t)
        const ratio = contrastRatio(result['text-secondary'], result['bg-base'])
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    })
  })

  describe('ThemeState.blendPosition', () => {
    it('accepts blendPosition as an optional number field', () => {
      const state: ThemeState = {
        mode: 'dark',
        activeThemeId: 'default-dark',
        overrides: {},
        customThemes: [],
        blendPosition: 0.5,
      }
      expect(state.blendPosition).toBe(0.5)
    })
  })
})
