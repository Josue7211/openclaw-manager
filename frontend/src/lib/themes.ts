export interface AccentPreset {
  id: string
  label: string
  color: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'purple', label: 'Purple', color: '#a78bfa' },
  { id: 'blue', label: 'Blue', color: '#60a5fa' },
  { id: 'green', label: 'Green', color: '#34d399' },
  { id: 'orange', label: 'Orange', color: '#fb923c' },
  { id: 'pink', label: 'Pink', color: '#f472b6' },
  { id: 'red', label: 'Red', color: '#f87171' },
  { id: 'cyan', label: 'Cyan', color: '#22d3ee' },
]

/** Default accent color (purple) */
export const DEFAULT_ACCENT = '#a78bfa'

/** Default glow color (purple, matches accent default) */
export const DEFAULT_GLOW = '#8b5cf6'

/** Default secondary color (green — functional/status color) */
export const DEFAULT_SECONDARY = '#34d399'

/** Default tertiary color (blue — chat bubbles, dashboard accents) */
export const DEFAULT_TERTIARY = '#818cf8'

/** Default logo color (matches accent) */
export const DEFAULT_LOGO = '#a78bfa'

/**
 * Darken a hex color by a percentage (0-100).
 */
function darken(hex: string, pct: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const factor = 1 - pct / 100
  return '#' + [r, g, b].map(c =>
    Math.round(Math.max(0, c * factor)).toString(16).padStart(2, '0')
  ).join('')
}

/**
 * Lighten a hex color by a percentage (0-100).
 */
function lighten(hex: string, pct: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const factor = pct / 100
  return '#' + [r, g, b].map(c =>
    Math.round(Math.min(255, c + (255 - c) * factor)).toString(16).padStart(2, '0')
  ).join('')
}

/** Apply accent color to document root. */
export function applyAccentColor(color: string): void {
  const el = document.documentElement
  el.style.setProperty('--accent', color)
  el.style.setProperty('--accent-dim', darken(color, 25))
  el.style.setProperty('--accent-bright', lighten(color, 25))
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

/** Apply glow color. */
export function applyGlowColor(color: string): void {
  document.documentElement.style.setProperty('--glow-top-rgb', hexToRgb(color))
}

/** Apply secondary (green/functional/status) color with legacy aliases. */
export function applySecondaryColor(color: string): void {
  const el = document.documentElement
  const dim = darken(color, 25)
  const bright = lighten(color, 25)
  const solid = darken(color, 15)
  el.style.setProperty('--secondary', color)
  el.style.setProperty('--secondary-dim', dim)
  el.style.setProperty('--secondary-bright', bright)
  el.style.setProperty('--secondary-solid', solid)
  el.style.setProperty('--green', color)
  el.style.setProperty('--green-bright', bright)
  el.style.setProperty('--green-400', color)
  el.style.setProperty('--green-500', darken(color, 10))
  el.style.setProperty('--accent-green', color)
}

/** Apply tertiary (blue/chat/dashboard) color with legacy aliases. */
export function applyTertiaryColor(color: string): void {
  const el = document.documentElement
  const dim = darken(color, 25)
  const bright = lighten(color, 25)
  el.style.setProperty('--tertiary', color)
  el.style.setProperty('--tertiary-dim', dim)
  el.style.setProperty('--tertiary-bright', bright)
  el.style.setProperty('--accent-blue', color)
  el.style.setProperty('--accent-secondary', color)
  el.style.setProperty('--accent-secondary-dim', dim)
  el.style.setProperty('--accent-secondary-bright', bright)
  el.style.setProperty('--blue-bright', bright)
}

/** Apply logo color. */
export function applyLogoColor(color: string): void {
  document.documentElement.style.setProperty('--logo-color', color)
}

export function getSavedAccent(): string | null {
  try {
    const stored = localStorage.getItem('accent-color')
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

export function getSavedGlowColor(): string | null {
  try {
    const stored = localStorage.getItem('glow-color')
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

export function getSavedSecondaryColor(): string | null {
  try {
    const stored = localStorage.getItem('secondary-color')
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

export function getSavedLogoColor(): string | null {
  try {
    const stored = localStorage.getItem('logo-color')
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}
