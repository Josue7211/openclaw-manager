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

/** Default secondary color (blue — maps to --accent-blue throughout the app) */
export const DEFAULT_SECONDARY = '#818cf8'

/** Default logo color (matches accent) */
export const DEFAULT_LOGO = '#a78bfa'

/**
 * Darken a hex color by a percentage (0-100).
 * Used to derive --accent-dim from the base accent.
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
 * Used to derive --accent-bright from the base accent.
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

/**
 * Apply an accent color to the document root, updating
 * --accent, --accent-dim, and --accent-bright CSS variables.
 */
export function applyAccentColor(color: string): void {
  const el = document.documentElement
  el.style.setProperty('--accent', color)
  el.style.setProperty('--accent-dim', darken(color, 25))
  el.style.setProperty('--accent-bright', lighten(color, 25))
}

/**
 * Convert hex to RGB components string like "139, 92, 246".
 */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

/**
 * Apply the top glow color to the document root.
 * Sets --glow-top-rgb which body::before uses for the ambient gradient.
 */
export function applyGlowColor(color: string): void {
  document.documentElement.style.setProperty('--glow-top-rgb', hexToRgb(color))
}

/**
 * Apply the secondary accent color to the document root.
 * Also updates --accent-blue and --blue-bright which are used across
 * Chat, Dashboard, Personal, HomeLab, and MediaRadar pages.
 */
export function applySecondaryColor(color: string): void {
  const el = document.documentElement
  el.style.setProperty('--accent-secondary', color)
  el.style.setProperty('--accent-secondary-dim', darken(color, 25))
  el.style.setProperty('--accent-secondary-bright', lighten(color, 25))
  // Wire into the actual secondary accent variables used by components
  el.style.setProperty('--accent-blue', color)
  el.style.setProperty('--blue-bright', lighten(color, 30))
}

/**
 * Apply the logo color to the document root.
 */
export function applyLogoColor(color: string): void {
  document.documentElement.style.setProperty('--logo-color', color)
}

/**
 * Read the persisted accent color from localStorage.
 * Returns null if nothing is saved (default purple will be used).
 */
export function getSavedAccent(): string | null {
  try {
    const stored = localStorage.getItem('accent-color')
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

/**
 * Read the persisted glow color from localStorage.
 */
export function getSavedGlowColor(): string | null {
  try {
    const stored = localStorage.getItem('glow-color')
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

/**
 * Read the persisted secondary color from localStorage.
 */
export function getSavedSecondaryColor(): string | null {
  try {
    const stored = localStorage.getItem('secondary-color')
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

/**
 * Read the persisted logo color from localStorage.
 */
export function getSavedLogoColor(): string | null {
  try {
    const stored = localStorage.getItem('logo-color')
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}
