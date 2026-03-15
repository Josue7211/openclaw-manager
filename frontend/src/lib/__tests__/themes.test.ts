import { describe, it, expect, vi, beforeEach } from 'vitest'

let applyAccentColor: typeof import('../themes').applyAccentColor
let applyGlowColor: typeof import('../themes').applyGlowColor
let applySecondaryColor: typeof import('../themes').applySecondaryColor
let applyLogoColor: typeof import('../themes').applyLogoColor
let getSavedAccent: typeof import('../themes').getSavedAccent
let getSavedGlowColor: typeof import('../themes').getSavedGlowColor
let getSavedSecondaryColor: typeof import('../themes').getSavedSecondaryColor
let getSavedLogoColor: typeof import('../themes').getSavedLogoColor
let ACCENT_PRESETS: typeof import('../themes').ACCENT_PRESETS
let DEFAULT_ACCENT: typeof import('../themes').DEFAULT_ACCENT
let DEFAULT_GLOW: typeof import('../themes').DEFAULT_GLOW
let DEFAULT_SECONDARY: typeof import('../themes').DEFAULT_SECONDARY
let DEFAULT_LOGO: typeof import('../themes').DEFAULT_LOGO

beforeEach(async () => {
  localStorage.clear()
  // Reset style properties on documentElement
  document.documentElement.removeAttribute('style')
  vi.resetModules()
  const mod = await import('../themes')
  applyAccentColor = mod.applyAccentColor
  applyGlowColor = mod.applyGlowColor
  applySecondaryColor = mod.applySecondaryColor
  applyLogoColor = mod.applyLogoColor
  getSavedAccent = mod.getSavedAccent
  getSavedGlowColor = mod.getSavedGlowColor
  getSavedSecondaryColor = mod.getSavedSecondaryColor
  getSavedLogoColor = mod.getSavedLogoColor
  ACCENT_PRESETS = mod.ACCENT_PRESETS
  DEFAULT_ACCENT = mod.DEFAULT_ACCENT
  DEFAULT_GLOW = mod.DEFAULT_GLOW
  DEFAULT_SECONDARY = mod.DEFAULT_SECONDARY
  DEFAULT_LOGO = mod.DEFAULT_LOGO
})

describe('ACCENT_PRESETS', () => {
  it('contains expected preset colors', () => {
    expect(ACCENT_PRESETS.length).toBeGreaterThanOrEqual(5)
    const ids = ACCENT_PRESETS.map(p => p.id)
    expect(ids).toContain('purple')
    expect(ids).toContain('blue')
    expect(ids).toContain('green')
  })

  it('each preset has id, label, and valid hex color', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.label).toBeTruthy()
      expect(preset.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('defaults', () => {
  it('DEFAULT_ACCENT matches the purple preset', () => {
    const purple = ACCENT_PRESETS.find(p => p.id === 'purple')!
    expect(DEFAULT_ACCENT).toBe(purple.color)
  })

  it('DEFAULT_GLOW is a valid hex color', () => {
    expect(DEFAULT_GLOW).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('DEFAULT_SECONDARY is a valid hex color', () => {
    expect(DEFAULT_SECONDARY).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('DEFAULT_LOGO matches DEFAULT_ACCENT', () => {
    expect(DEFAULT_LOGO).toBe(DEFAULT_ACCENT)
  })
})

describe('applyAccentColor', () => {
  it('sets --accent CSS variable on documentElement', () => {
    applyAccentColor('#ff0000')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff0000')
  })

  it('sets --accent-dim as a darkened variant', () => {
    applyAccentColor('#ff0000')
    const dim = document.documentElement.style.getPropertyValue('--accent-dim')
    expect(dim).toMatch(/^#[0-9a-f]{6}$/i)
    // Darkened red should have a lower red component
    const r = parseInt(dim.slice(1, 3), 16)
    expect(r).toBeLessThan(255)
  })

  it('sets --accent-bright as a lightened variant', () => {
    applyAccentColor('#800000')
    const bright = document.documentElement.style.getPropertyValue('--accent-bright')
    expect(bright).toMatch(/^#[0-9a-f]{6}$/i)
    // Lightened dark red should have a higher red component
    const r = parseInt(bright.slice(1, 3), 16)
    expect(r).toBeGreaterThan(0x80)
  })

  it('darkening pure black stays black', () => {
    applyAccentColor('#000000')
    const dim = document.documentElement.style.getPropertyValue('--accent-dim')
    expect(dim).toBe('#000000')
  })

  it('lightening pure white stays white', () => {
    applyAccentColor('#ffffff')
    const bright = document.documentElement.style.getPropertyValue('--accent-bright')
    expect(bright).toBe('#ffffff')
  })
})

describe('applyGlowColor', () => {
  it('sets --glow-top-rgb as comma-separated RGB values', () => {
    applyGlowColor('#ff8000')
    const rgb = document.documentElement.style.getPropertyValue('--glow-top-rgb')
    expect(rgb).toBe('255, 128, 0')
  })

  it('converts pure black correctly', () => {
    applyGlowColor('#000000')
    const rgb = document.documentElement.style.getPropertyValue('--glow-top-rgb')
    expect(rgb).toBe('0, 0, 0')
  })

  it('converts pure white correctly', () => {
    applyGlowColor('#ffffff')
    const rgb = document.documentElement.style.getPropertyValue('--glow-top-rgb')
    expect(rgb).toBe('255, 255, 255')
  })
})

describe('applySecondaryColor', () => {
  it('sets --accent-secondary CSS variable', () => {
    applySecondaryColor('#3366ff')
    expect(document.documentElement.style.getPropertyValue('--accent-secondary')).toBe('#3366ff')
  })

  it('sets --accent-secondary-dim and --accent-secondary-bright', () => {
    applySecondaryColor('#3366ff')
    expect(document.documentElement.style.getPropertyValue('--accent-secondary-dim')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(document.documentElement.style.getPropertyValue('--accent-secondary-bright')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('also sets --accent-blue and --blue-bright', () => {
    applySecondaryColor('#3366ff')
    expect(document.documentElement.style.getPropertyValue('--accent-blue')).toBe('#3366ff')
    expect(document.documentElement.style.getPropertyValue('--blue-bright')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('applyLogoColor', () => {
  it('sets --logo-color CSS variable', () => {
    applyLogoColor('#abcdef')
    expect(document.documentElement.style.getPropertyValue('--logo-color')).toBe('#abcdef')
  })
})

describe('getSavedAccent', () => {
  it('returns null when localStorage is empty', () => {
    expect(getSavedAccent()).toBeNull()
  })

  it('returns the stored accent color', () => {
    localStorage.setItem('accent-color', JSON.stringify('#ff0000'))
    expect(getSavedAccent()).toBe('#ff0000')
  })

  it('returns null on invalid JSON', () => {
    localStorage.setItem('accent-color', 'not-json')
    expect(getSavedAccent()).toBeNull()
  })
})

describe('getSavedGlowColor', () => {
  it('returns null when localStorage is empty', () => {
    expect(getSavedGlowColor()).toBeNull()
  })

  it('returns the stored glow color', () => {
    localStorage.setItem('glow-color', JSON.stringify('#8b5cf6'))
    expect(getSavedGlowColor()).toBe('#8b5cf6')
  })
})

describe('getSavedSecondaryColor', () => {
  it('returns null when localStorage is empty', () => {
    expect(getSavedSecondaryColor()).toBeNull()
  })

  it('returns the stored secondary color', () => {
    localStorage.setItem('secondary-color', JSON.stringify('#818cf8'))
    expect(getSavedSecondaryColor()).toBe('#818cf8')
  })
})

describe('getSavedLogoColor', () => {
  it('returns null when localStorage is empty', () => {
    expect(getSavedLogoColor()).toBeNull()
  })

  it('returns the stored logo color', () => {
    localStorage.setItem('logo-color', JSON.stringify('#a78bfa'))
    expect(getSavedLogoColor()).toBe('#a78bfa')
  })

  it('returns null on invalid JSON', () => {
    localStorage.setItem('logo-color', '{bad')
    expect(getSavedLogoColor()).toBeNull()
  })
})
