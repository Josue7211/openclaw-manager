import { describe, it, expect } from 'vitest'
import { hexToOklch, oklchToHex, interpolateHexOklch } from '../color-utils'

describe('hexToOklch', () => {
  it('converts black to [0, 0, 0]', () => {
    const [L, C, H] = hexToOklch('#000000')
    expect(L).toBeCloseTo(0, 4)
    expect(C).toBeCloseTo(0, 4)
    // Hue is irrelevant for black (zero chroma), but should not throw
    expect(typeof H).toBe('number')
  })

  it('converts white to [1, 0, H]', () => {
    const [L, C, H] = hexToOklch('#ffffff')
    expect(L).toBeCloseTo(1, 4)
    expect(C).toBeCloseTo(0, 3)
    expect(typeof H).toBe('number')
  })

  it('converts pure red to known OKLCH values', () => {
    const [L, C, H] = hexToOklch('#ff0000')
    expect(L).toBeCloseTo(0.6278, 2)
    expect(C).toBeCloseTo(0.2577, 2)
    expect(H).toBeCloseTo(29.23, 0)
  })

  it('converts pure green without errors', () => {
    const [L, C, H] = hexToOklch('#00ff00')
    expect(L).toBeGreaterThan(0)
    expect(C).toBeGreaterThan(0)
    expect(H).toBeGreaterThanOrEqual(0)
    expect(H).toBeLessThan(360)
  })

  it('converts pure blue without errors', () => {
    const [L, C, H] = hexToOklch('#0000ff')
    expect(L).toBeGreaterThan(0)
    expect(C).toBeGreaterThan(0)
    expect(H).toBeGreaterThanOrEqual(0)
    expect(H).toBeLessThan(360)
  })
})

describe('oklchToHex', () => {
  it('converts [0, 0, 0] to #000000', () => {
    expect(oklchToHex([0, 0, 0])).toBe('#000000')
  })

  it('converts [1, 0, 0] to #ffffff', () => {
    expect(oklchToHex([1, 0, 0])).toBe('#ffffff')
  })

  it('returns a valid 7-char hex string', () => {
    const hex = oklchToHex([0.5, 0.1, 180])
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('round-trip fidelity', () => {
  const ACCENT_PRESETS = [
    '#a78bfa',
    '#60a5fa',
    '#34d399',
    '#fb923c',
    '#f472b6',
    '#f87171',
    '#22d3ee',
  ]

  it.each(ACCENT_PRESETS)('round-trips %s within 1 unit per RGB channel', (hex) => {
    const oklch = hexToOklch(hex)
    const result = oklchToHex(oklch)

    // Parse both hex strings to compare RGB channels
    const originalR = parseInt(hex.slice(1, 3), 16)
    const originalG = parseInt(hex.slice(3, 5), 16)
    const originalB = parseInt(hex.slice(5, 7), 16)
    const resultR = parseInt(result.slice(1, 3), 16)
    const resultG = parseInt(result.slice(3, 5), 16)
    const resultB = parseInt(result.slice(5, 7), 16)

    expect(Math.abs(originalR - resultR)).toBeLessThanOrEqual(1)
    expect(Math.abs(originalG - resultG)).toBeLessThanOrEqual(1)
    expect(Math.abs(originalB - resultB)).toBeLessThanOrEqual(1)
  })

  it('round-trips #a78bfa within tolerance', () => {
    const oklch = hexToOklch('#a78bfa')
    const result = oklchToHex(oklch)
    const origR = parseInt('a7', 16)
    const origG = parseInt('8b', 16)
    const origB = parseInt('fa', 16)
    const resR = parseInt(result.slice(1, 3), 16)
    const resG = parseInt(result.slice(3, 5), 16)
    const resB = parseInt(result.slice(5, 7), 16)
    expect(Math.abs(origR - resR)).toBeLessThanOrEqual(1)
    expect(Math.abs(origG - resG)).toBeLessThanOrEqual(1)
    expect(Math.abs(origB - resB)).toBeLessThanOrEqual(1)
  })

  it('round-trips #34d399 within tolerance', () => {
    const oklch = hexToOklch('#34d399')
    const result = oklchToHex(oklch)
    const origR = parseInt('34', 16)
    const origG = parseInt('d3', 16)
    const origB = parseInt('99', 16)
    const resR = parseInt(result.slice(1, 3), 16)
    const resG = parseInt(result.slice(3, 5), 16)
    const resB = parseInt(result.slice(5, 7), 16)
    expect(Math.abs(origR - resR)).toBeLessThanOrEqual(1)
    expect(Math.abs(origG - resG)).toBeLessThanOrEqual(1)
    expect(Math.abs(origB - resB)).toBeLessThanOrEqual(1)
  })
})

describe('interpolateHexOklch', () => {
  it('returns first color at t=0', () => {
    expect(interpolateHexOklch('#000000', '#ffffff', 0)).toBe('#000000')
  })

  it('returns second color at t=1', () => {
    expect(interpolateHexOklch('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  it('returns mid-gray at t=0.5 between black and white', () => {
    const mid = interpolateHexOklch('#000000', '#ffffff', 0.5)
    const r = parseInt(mid.slice(1, 3), 16)
    const g = parseInt(mid.slice(3, 5), 16)
    const b = parseInt(mid.slice(5, 7), 16)
    // OKLCH perceptual lightness L=0.5 maps to sRGB ~99/255 (non-linear)
    // Range 90-145 accounts for perceptually uniform midpoint
    expect(r).toBeGreaterThanOrEqual(90)
    expect(r).toBeLessThanOrEqual(145)
    expect(g).toBeGreaterThanOrEqual(90)
    expect(g).toBeLessThanOrEqual(145)
    expect(b).toBeGreaterThanOrEqual(90)
    expect(b).toBeLessThanOrEqual(145)
  })

  it('produces valid hex for red-blue interpolation', () => {
    const result = interpolateHexOklch('#ff0000', '#0000ff', 0.5)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
    // Should not produce NaN or crash
    expect(result).not.toContain('NaN')
  })

  it('clamps t < 0 to 0', () => {
    const result = interpolateHexOklch('#ff0000', '#0000ff', -0.5)
    expect(result).toBe(interpolateHexOklch('#ff0000', '#0000ff', 0))
  })

  it('clamps t > 1 to 1', () => {
    const result = interpolateHexOklch('#ff0000', '#0000ff', 1.5)
    expect(result).toBe(interpolateHexOklch('#ff0000', '#0000ff', 1))
  })

  it('handles same color interpolation', () => {
    const result = interpolateHexOklch('#a78bfa', '#a78bfa', 0.5)
    // Should be very close to the original
    const origR = parseInt('a7', 16)
    const resR = parseInt(result.slice(1, 3), 16)
    expect(Math.abs(origR - resR)).toBeLessThanOrEqual(1)
  })

  it('handles edge case colors without throwing', () => {
    expect(() => interpolateHexOklch('#000000', '#000000', 0.5)).not.toThrow()
    expect(() => interpolateHexOklch('#ffffff', '#ffffff', 0.5)).not.toThrow()
    expect(() => interpolateHexOklch('#ff0000', '#00ff00', 0.5)).not.toThrow()
  })
})
