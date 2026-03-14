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
