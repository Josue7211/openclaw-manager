/**
 * Tests for buildWallbashTheme() — maps wallbash color variables to ThemeDefinition.
 *
 * Wallbash regenerates colors.conf on mode switch — pry1 is ALWAYS the current
 * mode's base background. Dark mode gets dark pry1, light mode gets light pry1.
 * We use TWO separate mock color sets to simulate this.
 */

import { describe, it, expect } from 'vitest'
import { buildWallbashTheme } from '../theme-engine'
import type { WallbashColors } from '../theme-definitions'

/** Simulates wallbash output when desktop is in dark mode */
const MOCK_DARK_COLORS: WallbashColors = {
  wallbash_pry1: '#11151A',
  wallbash_pry2: '#1a1e26',
  wallbash_pry3: '#2a2e36',
  wallbash_pry4: '#f5e8e6',
  wallbash_txt1: '#FFFFFF',
  wallbash_txt2: '#c0c0c0',
  wallbash_txt3: '#3a3a3a',
  wallbash_txt4: '#101111',
  wallbash_1xa5: '#34d399',
  wallbash_2xa5: '#f87171',
  wallbash_2xa7: '#fbbf24',
  wallbash_3xa3: '#4a6580',
  wallbash_3xa5: '#6581A3',
  wallbash_3xa7: '#8aa0c0',
  wallbash_4xa5: '#60a5fa',
}

/** Simulates wallbash output when desktop is in light mode —
 *  pry1 is now light, txt1 is dark (wallbash regenerates the file) */
const MOCK_LIGHT_COLORS: WallbashColors = {
  wallbash_pry1: '#F9F9F9',
  wallbash_pry2: '#E8E8E8',
  wallbash_pry3: '#D0D0D0',
  wallbash_pry4: '#111111',
  wallbash_txt1: '#101010',
  wallbash_txt2: '#3a3a3a',
  wallbash_txt3: '#c0c0c0',
  wallbash_txt4: '#FFFFFF',
  wallbash_1xa5: '#34d399',
  wallbash_2xa5: '#f87171',
  wallbash_2xa7: '#fbbf24',
  wallbash_3xa3: '#4a6580',
  wallbash_3xa5: '#6581A3',
  wallbash_3xa7: '#8aa0c0',
  wallbash_4xa5: '#60a5fa',
}

describe('buildWallbashTheme', () => {
  describe('dark mode (prefer-dark)', () => {
    it('returns a ThemeDefinition with id wallbash-live', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.id).toBe('wallbash-live')
      expect(def.builtIn).toBe(true)
      expect(def.name).toBe('Wallbash')
      expect(def.category).toBe('dark')
    })

    it('uses pry1 for bg-base (dark bg from dark-mode file)', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['bg-base']).toBe('#11151A')
    })

    it('uses pry2 for bg-panel/bg-card-solid', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['bg-card-solid']).toBe('#1a1e26')
    })

    it('uses txt1 for text-primary', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['text-primary']).toBe('#FFFFFF')
    })

    it('uses txt2 for text-secondary', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['text-secondary']).toBe('#c0c0c0')
    })
  })

  describe('light mode (prefer-light)', () => {
    it('returns category light', () => {
      const def = buildWallbashTheme(MOCK_LIGHT_COLORS, 'prefer-light')
      expect(def.category).toBe('light')
      expect(def.id).toBe('wallbash-live')
    })

    it('uses pry1 for bg-base (light bg from light-mode file)', () => {
      const def = buildWallbashTheme(MOCK_LIGHT_COLORS, 'prefer-light')
      expect(def.colors['bg-base']).toBe('#F9F9F9')
    })

    it('uses pry2 for bg-card-solid (light panels from light-mode file)', () => {
      const def = buildWallbashTheme(MOCK_LIGHT_COLORS, 'prefer-light')
      expect(def.colors['bg-card-solid']).toBe('#E8E8E8')
    })

    it('uses txt1 for text-primary (dark text from light-mode file)', () => {
      const def = buildWallbashTheme(MOCK_LIGHT_COLORS, 'prefer-light')
      expect(def.colors['text-primary']).toBe('#101010')
    })

    it('uses txt2 for text-secondary', () => {
      const def = buildWallbashTheme(MOCK_LIGHT_COLORS, 'prefer-light')
      expect(def.colors['text-secondary']).toBe('#3a3a3a')
    })
  })

  describe('accent colors', () => {
    it('uses wallbash_3xa5 for accent', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['accent']).toBe('#6581A3')
    })

    it('uses wallbash_3xa3 for accent-dim', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['accent-dim']).toBe('#4a6580')
    })

    it('uses wallbash_3xa7 for accent-bright', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['accent-bright']).toBe('#8aa0c0')
    })

    it('uses wallbash_1xa5 for green (secondary)', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['green']).toBe('#34d399')
    })

    it('uses wallbash_2xa5 for red', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['red']).toBe('#f87171')
    })

    it('uses wallbash_2xa7 for warning', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      expect(def.colors['warning']).toBe('#fbbf24')
    })
  })

  describe('missing color keys', () => {
    it('uses fallback values for missing keys', () => {
      const sparse: WallbashColors = {
        wallbash_3xa5: '#aabbcc',
      }
      const def = buildWallbashTheme(sparse, 'prefer-dark')
      // Should not throw, and should have fallback bg-base
      expect(def.colors['bg-base']).toBe('#11151A')
      expect(def.colors['accent']).toBe('#aabbcc')
    })

    it('uses all fallbacks when given empty colors', () => {
      const def = buildWallbashTheme({}, 'prefer-dark')
      expect(def.id).toBe('wallbash-live')
      expect(def.colors['bg-base']).toBe('#11151A')
      expect(def.colors['text-primary']).toBe('#FFFFFF')
      expect(def.colors['accent']).toBe('#6581A3')
    })

    it('uses light fallbacks for prefer-light with empty colors', () => {
      const def = buildWallbashTheme({}, 'prefer-light')
      expect(def.colors['bg-base']).toBe('#f5e8e6')
      expect(def.colors['text-primary']).toBe('#101111')
    })
  })

  describe('rgba composited values', () => {
    it('generates rgba bg-panel from pry2', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      // pry2 = #1a1e26 -> rgb(26, 30, 38)
      expect(def.colors['bg-panel']).toBe('rgba(26, 30, 38, 0.85)')
    })

    it('generates rgba bg-elevated from pry3', () => {
      const def = buildWallbashTheme(MOCK_DARK_COLORS, 'prefer-dark')
      // pry3 = #2a2e36 -> rgb(42, 46, 54)
      expect(def.colors['bg-elevated']).toBe('rgba(42, 46, 54, 0.6)')
    })

    it('light mode also uses pry2 for bg-panel and pry3 for elevated', () => {
      const def = buildWallbashTheme(MOCK_LIGHT_COLORS, 'prefer-light')
      // pry2 = #E8E8E8 -> rgb(232, 232, 232)
      expect(def.colors['bg-panel']).toBe('rgba(232, 232, 232, 0.85)')
      // pry3 = #D0D0D0 -> rgb(208, 208, 208)
      expect(def.colors['bg-elevated']).toBe('rgba(208, 208, 208, 0.6)')
    })
  })
})
