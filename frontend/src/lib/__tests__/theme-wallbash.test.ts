/**
 * Tests for buildWallbashTheme() — maps wallbash color variables to ThemeDefinition.
 *
 * Wallbash extracts a fixed color gradient from the wallpaper:
 *   pry1=darkest → pry4=lightest, txt1=light text → txt4=dark text
 * COLOR_SCHEME (prefer-dark / prefer-light) tells us which end to use.
 */

import { describe, it, expect } from 'vitest'
import { buildWallbashTheme } from '../theme-engine'
import type { WallbashColors } from '../theme-definitions'

/** Same colors for both modes — the gradient is fixed, COLOR_SCHEME picks the end */
const MOCK_COLORS: WallbashColors = {
  wallbash_pry1: '#11151A',  // darkest
  wallbash_pry2: '#1a1e26',
  wallbash_pry3: '#B5B4B4',
  wallbash_pry4: '#F9F9F9',  // lightest
  wallbash_txt1: '#FFFFFF',  // white text (for dark bg)
  wallbash_txt2: '#c0c0c0',
  wallbash_txt3: '#3a3a3a',
  wallbash_txt4: '#101111',  // dark text (for light bg)
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
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.id).toBe('wallbash-live')
      expect(def.builtIn).toBe(true)
      expect(def.name).toBe('Wallbash')
      expect(def.category).toBe('dark')
    })

    it('uses pry1 (darkest) for bg-base', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['bg-base']).toBe('#11151A')
    })

    it('uses pry2 for bg-card-solid', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['bg-card-solid']).toBe('#1a1e26')
    })

    it('uses txt1 (white) for text-primary', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['text-primary']).toBe('#FFFFFF')
    })

    it('uses txt2 for text-secondary', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['text-secondary']).toBe('#c0c0c0')
    })
  })

  describe('light mode (prefer-light) — same colors, opposite end', () => {
    it('returns category light', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-light')
      expect(def.category).toBe('light')
    })

    it('uses pry4 (lightest) for bg-base', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-light')
      expect(def.colors['bg-base']).toBe('#F9F9F9')
    })

    it('uses pry3 for bg-card-solid', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-light')
      expect(def.colors['bg-card-solid']).toBe('#B5B4B4')
    })

    it('uses txt4 (dark) for text-primary', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-light')
      expect(def.colors['text-primary']).toBe('#101111')
    })

    it('uses txt3 for text-secondary', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-light')
      expect(def.colors['text-secondary']).toBe('#3a3a3a')
    })
  })

  describe('accent colors (same regardless of mode)', () => {
    it('uses wallbash_3xa5 for accent', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['accent']).toBe('#6581A3')
    })

    it('uses wallbash_3xa3 for accent-dim', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['accent-dim']).toBe('#4a6580')
    })

    it('uses wallbash_3xa7 for accent-bright', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['accent-bright']).toBe('#8aa0c0')
    })

    it('uses wallbash_1xa5 for green (secondary)', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['green']).toBe('#34d399')
    })

    it('uses wallbash_2xa5 for red', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['red']).toBe('#f87171')
    })

    it('uses wallbash_2xa7 for warning', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      expect(def.colors['warning']).toBe('#fbbf24')
    })
  })

  describe('missing color keys', () => {
    it('uses fallback values for missing keys', () => {
      const sparse: WallbashColors = {
        wallbash_3xa5: '#aabbcc',
      }
      const def = buildWallbashTheme(sparse, 'prefer-dark')
      expect(def.colors['bg-base']).toBe('#11151A')
      expect(def.colors['accent']).toBe('#aabbcc')
    })

    it('uses dark fallbacks when given empty colors in dark mode', () => {
      const def = buildWallbashTheme({}, 'prefer-dark')
      expect(def.id).toBe('wallbash-live')
      expect(def.colors['bg-base']).toBe('#11151A')
      expect(def.colors['text-primary']).toBe('#FFFFFF')
    })

    it('uses light fallbacks when given empty colors in light mode', () => {
      const def = buildWallbashTheme({}, 'prefer-light')
      expect(def.colors['bg-base']).toBe('#f5e8e6')
      expect(def.colors['text-primary']).toBe('#101111')
    })
  })

  describe('rgba composited values', () => {
    it('dark mode: bg-panel from pry2, bg-elevated from pry3', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-dark')
      // pry2 = #1a1e26 -> rgb(26, 30, 38)
      expect(def.colors['bg-panel']).toBe('rgba(26, 30, 38, 0.85)')
      // pry3 = #B5B4B4 -> rgb(181, 180, 180)
      expect(def.colors['bg-elevated']).toBe('rgba(181, 180, 180, 0.6)')
    })

    it('light mode: bg-panel from pry3, bg-elevated from pry2', () => {
      const def = buildWallbashTheme(MOCK_COLORS, 'prefer-light')
      // pry3 = #B5B4B4 -> rgb(181, 180, 180)
      expect(def.colors['bg-panel']).toBe('rgba(181, 180, 180, 0.85)')
      // pry2 = #1a1e26 -> rgb(26, 30, 38)
      expect(def.colors['bg-elevated']).toBe('rgba(26, 30, 38, 0.6)')
    })
  })
})
