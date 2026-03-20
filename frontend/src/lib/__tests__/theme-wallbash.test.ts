/**
 * Tests for buildWallbashTheme() — maps wallbash color variables to ThemeDefinition.
 */

import { describe, it, expect } from 'vitest'
import { buildWallbashTheme } from '../theme-engine'
import type { WallbashColors } from '../theme-definitions'

const MOCK_WALLBASH_COLORS: WallbashColors = {
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

describe('buildWallbashTheme', () => {
  describe('dark mode (prefer-dark)', () => {
    it('returns a ThemeDefinition with id wallbash-live', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.id).toBe('wallbash-live')
      expect(def.builtIn).toBe(true)
      expect(def.name).toBe('Wallbash')
      expect(def.category).toBe('dark')
    })

    it('uses pry1 for bg-base in dark mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['bg-base']).toBe('#11151A')
    })

    it('uses pry2 for bg-panel/bg-card-solid in dark mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['bg-card-solid']).toBe('#1a1e26')
    })

    it('uses txt1 for text-primary in dark mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['text-primary']).toBe('#FFFFFF')
    })

    it('uses txt2 for text-secondary in dark mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['text-secondary']).toBe('#c0c0c0')
    })
  })

  describe('light mode (prefer-light)', () => {
    it('returns category light', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-light')
      expect(def.category).toBe('light')
      expect(def.id).toBe('wallbash-live')
    })

    it('uses pry4 for bg-base in light mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-light')
      expect(def.colors['bg-base']).toBe('#f5e8e6')
    })

    it('uses pry3 for bg-card-solid in light mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-light')
      expect(def.colors['bg-card-solid']).toBe('#2a2e36')
    })

    it('uses txt4 for text-primary in light mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-light')
      expect(def.colors['text-primary']).toBe('#101111')
    })

    it('uses txt3 for text-secondary in light mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-light')
      expect(def.colors['text-secondary']).toBe('#3a3a3a')
    })
  })

  describe('accent colors', () => {
    it('uses wallbash_3xa5 for accent', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['accent']).toBe('#6581A3')
    })

    it('uses wallbash_3xa3 for accent-dim', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['accent-dim']).toBe('#4a6580')
    })

    it('uses wallbash_3xa7 for accent-bright', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['accent-bright']).toBe('#8aa0c0')
    })

    it('uses wallbash_1xa5 for green (secondary)', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['green']).toBe('#34d399')
    })

    it('uses wallbash_2xa5 for red', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      expect(def.colors['red']).toBe('#f87171')
    })

    it('uses wallbash_2xa7 for warning', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
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
  })

  describe('rgba composited values', () => {
    it('generates rgba bg-panel from pry2 in dark mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      // pry2 = #1a1e26 -> rgb(26, 30, 38)
      expect(def.colors['bg-panel']).toBe('rgba(26, 30, 38, 0.85)')
    })

    it('generates rgba bg-elevated from pry3 in dark mode', () => {
      const def = buildWallbashTheme(MOCK_WALLBASH_COLORS, 'prefer-dark')
      // pry3 = #2a2e36 -> rgb(42, 46, 54)
      expect(def.colors['bg-elevated']).toBe('rgba(42, 46, 54, 0.6)')
    })
  })
})
