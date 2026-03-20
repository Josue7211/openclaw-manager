/**
 * WCAG Contrast Ratio Audit for all 24 built-in themes.
 *
 * Requirements:
 *   text-primary  vs bg-base:       >= 7.0  (WCAG AAA)
 *   text-secondary vs bg-base:      >= 4.5  (WCAG AA)
 *   text-muted    vs bg-base:       >= 3.0  (WCAG AA large text)
 *   text-primary  vs bg-card-solid: >= 4.5  (WCAG AA)
 *   accent        vs bg-base:       >= 3.0
 */

import { describe, it, expect } from 'vitest'
import { BUILT_IN_THEMES } from '../theme-definitions'

// ---------------------------------------------------------------------------
// WCAG contrast helpers
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

function parseRgba(rgba: string, bgHex: string): string {
  const match = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/)
  if (!match) return bgHex
  const fr = parseInt(match[1])
  const fg = parseInt(match[2])
  const fb = parseInt(match[3])
  const alpha = match[4] ? parseFloat(match[4]) : 1.0
  const br = parseInt(bgHex.slice(1, 3), 16)
  const bg = parseInt(bgHex.slice(3, 5), 16)
  const bb = parseInt(bgHex.slice(5, 7), 16)
  const r = Math.round(fr * alpha + br * (1 - alpha))
  const g = Math.round(fg * alpha + bg * (1 - alpha))
  const b = Math.round(fb * alpha + bb * (1 - alpha))
  return '#' + [r, g, b].map(c => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0')).join('')
}

function resolveColor(color: string, bgHex: string): string {
  if (color.startsWith('rgba') || color.startsWith('rgb(')) return parseRgba(color, bgHex)
  return color
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  const gamma = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * gamma(r) + 0.7152 * gamma(g) + 0.0722 * gamma(b)
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('theme contrast audit', () => {
  for (const theme of BUILT_IN_THEMES) {
    describe(theme.id, () => {
      const bg = theme.colors['bg-base']
      const card = theme.colors['bg-card-solid']
      const tp = resolveColor(theme.colors['text-primary'], bg)
      const ts = resolveColor(theme.colors['text-secondary'], bg)
      const tm = resolveColor(theme.colors['text-muted'], bg)
      const accent = theme.colors['accent']

      it('text-primary vs bg-base >= 7.0 (AAA)', () => {
        const ratio = contrastRatio(tp, bg)
        expect(ratio, `${tp} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(7.0)
      })

      it('text-secondary vs bg-base >= 4.5 (AA)', () => {
        const ratio = contrastRatio(ts, bg)
        expect(ratio, `${ts} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      })

      it('text-muted vs bg-base >= 3.0 (AA large)', () => {
        const ratio = contrastRatio(tm, bg)
        expect(ratio, `${tm} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3.0)
      })

      it('text-primary vs bg-card-solid >= 4.5 (AA)', () => {
        const ratio = contrastRatio(tp, card)
        expect(ratio, `${tp} on ${card} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      })

      it('accent vs bg-base >= 3.0', () => {
        const ratio = contrastRatio(accent, bg)
        expect(ratio, `${accent} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3.0)
      })
    })
  }
})

// ---------------------------------------------------------------------------
// Composited surface tests (light themes only)
// ---------------------------------------------------------------------------
// Tests text against bg-panel and bg-card composited on bg-base — the real
// visual surface users see. Catches colors that pass on raw bg-base but fail
// when rendered on the lighter composited surfaces.

describe('theme contrast audit — composited surfaces', () => {
  const isLightTheme = (t: typeof BUILT_IN_THEMES[number]) =>
    t.category === 'light' || t.id === 'high-contrast-light'

  for (const theme of BUILT_IN_THEMES) {
    if (!isLightTheme(theme)) continue

    describe(`${theme.id} (composited)`, () => {
      const bgBase = theme.colors['bg-base']
      const bgPanel = resolveColor(theme.colors['bg-panel'], bgBase)
      const bgCard = resolveColor(theme.colors['bg-card'], bgBase)
      const tp = resolveColor(theme.colors['text-primary'], bgBase)
      const ts = resolveColor(theme.colors['text-secondary'], bgBase)
      const tm = resolveColor(theme.colors['text-muted'], bgBase)

      it('text-primary vs bg-panel (composited) >= 7.0 (AAA)', () => {
        const ratio = contrastRatio(tp, bgPanel)
        expect(ratio, `${tp} on ${bgPanel} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(7.0)
      })

      it('text-secondary vs bg-panel (composited) >= 4.5 (AA)', () => {
        const ratio = contrastRatio(ts, bgPanel)
        expect(ratio, `${ts} on ${bgPanel} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      })

      it('text-muted vs bg-panel (composited) >= 3.0 (AA large)', () => {
        const ratio = contrastRatio(tm, bgPanel)
        expect(ratio, `${tm} on ${bgPanel} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3.0)
      })

      it('text-primary vs bg-card (composited) >= 4.5 (AA)', () => {
        const ratio = contrastRatio(tp, bgCard)
        expect(ratio, `${tp} on ${bgCard} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      })

      it('text-secondary vs bg-card (composited) >= 4.5 (AA)', () => {
        const ratio = contrastRatio(ts, bgCard)
        expect(ratio, `${ts} on ${bgCard} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      })
    })
  }
})
