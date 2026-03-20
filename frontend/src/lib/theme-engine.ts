/**
 * Theme Engine — applies ThemeState to the DOM via CSS custom properties.
 *
 * Responsibilities:
 *   - Resolve which ThemeDefinition to use given the current ThemeState
 *   - Apply all CSS custom properties from a theme's colors map
 *   - Regenerate alpha tint variables from the active accent color
 *   - Apply font families and font scale
 *   - Orchestrate the View Transitions API ripple animation (with fallback)
 */

import { flushSync } from 'react-dom'
import { BUILT_IN_THEMES, COUNTERPART_MAP, getThemeById } from './theme-definitions'
import type { ThemeDefinition, ThemeState, UserThemeOverrides, WallbashColors } from './theme-definitions'
import {
  applyAccentColor,
  applyGlowColor,
  applySecondaryColor,
  applyTertiaryColor,
  applyLogoColor,
} from './themes'

// ---------------------------------------------------------------------------
// resolveThemeDefinition
// ---------------------------------------------------------------------------

let _osDarkCached: boolean | null = null
let _gtkThemeId: string | null = null

// ---------------------------------------------------------------------------
// Wallbash live color state
// ---------------------------------------------------------------------------

let _wallbashColors: WallbashColors | null = null
let _wallbashColorScheme: 'prefer-dark' | 'prefer-light' = 'prefer-dark'
/** Timestamp of last wallbash event — used to suppress competing event sources */
let _wallbashLastUpdate = 0
/** Monotonically increasing counter — incremented on every wallbash state change.
 *  Used to bust any potential caching when colors are identical but scheme changed. */
let _wallbashGeneration = 0

export function setWallbashColors(colors: WallbashColors) {
  _wallbashColors = colors
  _wallbashLastUpdate = Date.now()
  _wallbashGeneration++
}

export function setWallbashColorScheme(scheme: 'prefer-dark' | 'prefer-light') {
  _wallbashColorScheme = scheme
  _wallbashLastUpdate = Date.now()
  _wallbashGeneration++
}

export function getWallbashGeneration(): number {
  return _wallbashGeneration
}

export function getWallbashColors(): WallbashColors | null {
  return _wallbashColors
}

export function getWallbashColorScheme(): 'prefer-dark' | 'prefer-light' {
  return _wallbashColorScheme
}

/** True if wallbash is active and recently updated — gsettings poll should skip. */
export function isWallbashActive(): boolean {
  return _wallbashColors !== null
}

/** True if a wallbash event arrived within the last N ms — suppress competing sources. */
export function wallbashUpdatedRecently(withinMs = 5000): boolean {
  return _wallbashLastUpdate > 0 && (Date.now() - _wallbashLastUpdate) < withinMs
}

// ---------------------------------------------------------------------------
// buildWallbashTheme — maps wallbash color variables to a ThemeDefinition
// ---------------------------------------------------------------------------

function hexToRgbStr(hex: string): string {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`
}

export function buildWallbashTheme(
  colors: WallbashColors,
  colorScheme: 'prefer-dark' | 'prefer-light',
): ThemeDefinition {
  const isDark = colorScheme === 'prefer-dark'

  // Wallbash color gradient is fixed (extracted from wallpaper):
  //   pry1=darkest → pry4=lightest, txt1=light text → txt4=dark text
  // COLOR_SCHEME tells us which end to use as background.
  const bgBase = isDark ? (colors.wallbash_pry1 || '#11151A') : (colors.wallbash_pry4 || '#f5e8e6')
  const bgPanel = isDark ? (colors.wallbash_pry2 || '#1a1e26') : (colors.wallbash_pry3 || '#d5c8c6')
  const bgElevated = isDark ? (colors.wallbash_pry3 || '#2a2e36') : (colors.wallbash_pry2 || '#e8dbd9')
  const textPrimary = isDark ? (colors.wallbash_txt1 || '#FFFFFF') : (colors.wallbash_txt4 || '#101111')
  const textSecondary = isDark ? (colors.wallbash_txt2 || '#c0c0c0') : (colors.wallbash_txt3 || '#3a3a3a')

  const accent = colors.wallbash_3xa5 || '#6581A3'
  const accentDim = colors.wallbash_3xa3 || '#4a6580'
  const accentBright = colors.wallbash_3xa7 || '#8aa0c0'
  const secondary = colors.wallbash_1xa5 || '#34d399'
  const tertiary = colors.wallbash_4xa5 || '#60a5fa'

  return {
    id: 'wallbash-live',
    name: 'Wallbash',
    category: isDark ? 'dark' : 'light',
    builtIn: true,
    colors: {
      'bg-base': bgBase,
      'bg-panel': `rgba(${hexToRgbStr(bgPanel)}, 0.85)`,
      'bg-card': `rgba(${hexToRgbStr(bgPanel)}, 0.75)`,
      'bg-card-hover': `rgba(${hexToRgbStr(bgPanel)}, 0.9)`,
      'bg-elevated': `rgba(${hexToRgbStr(bgElevated)}, 0.6)`,
      'bg-card-solid': bgPanel,
      'bg-popover': `rgba(${hexToRgbStr(bgElevated)}, 0.92)`,
      'bg-modal': `rgba(${hexToRgbStr(bgPanel)}, 0.97)`,
      'text-primary': textPrimary,
      'text-secondary': textSecondary,
      'text-muted': isDark
        ? `rgba(${hexToRgbStr(textPrimary)}, 0.55)`
        : `rgba(${hexToRgbStr(textPrimary)}, 0.6)`,
      'border': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      'border-hover': isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)',
      'border-strong': isDark ? bgElevated : 'rgba(0,0,0,0.12)',
      'border-subtle': isDark ? bgPanel : 'rgba(0,0,0,0.06)',
      'glass-bg': `rgba(${hexToRgbStr(bgPanel)}, 0.6)`,
      'glass-border': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      'hover-bg': isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      'hover-bg-bright': isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      'active-bg': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      'overlay-light': 'rgba(0,0,0,0.3)',
      'overlay': 'rgba(0,0,0,0.4)',
      'overlay-heavy': 'rgba(0,0,0,0.55)',
      'accent': accent,
      'accent-dim': accentDim,
      'accent-bright': accentBright,
      'glow-top-rgb': hexToRgbStr(accentDim),
      'green': secondary,
      'red': colors.wallbash_2xa5 || '#f87171',
      'red-500': colors.wallbash_2xa5 || '#ef4444',
      'warning': colors.wallbash_2xa7 || '#fbbf24',
      'accent-secondary': tertiary,
    },
  }
}

/** Called from main.tsx on startup and whenever the system theme changes. */
export function setOsDarkPreference(dark: boolean) {
  _osDarkCached = dark
}

// ---------------------------------------------------------------------------
// GTK theme name → built-in preset mapping
// ---------------------------------------------------------------------------

/**
 * Map of GTK theme name patterns to built-in preset IDs.
 * These map the DARK variant — resolveThemeDefinition picks the light counterpart
 * via COUNTERPART_MAP when COLOR_SCHEME is prefer-light.
 */
const GTK_THEME_MAP: ReadonlyArray<[RegExp, string]> = [
  [/^rose-?pine$/i, 'rose-pine'],
  [/^catppuccin[- ]?mocha$/i, 'catppuccin-mocha'],
  [/^catppuccin[- ]?latte$/i, 'catppuccin-latte'],
  [/^dracula$/i, 'dracula'],
  [/^nord(?:ic)?(?:[- ]?blue)?$/i, 'nord'],
  [/^gruvbox[- ]?(?:dark|retro)$/i, 'gruvbox-dark'],
  [/^gruvbox[- ]?light$/i, 'gruvbox-light'],
  [/^solarized[- ]?dark$/i, 'solarized-dark'],
  [/^solarized[- ]?light$/i, 'solarized-light'],
  [/^tokyo[- ]?night$/i, 'tokyo-night'],
  [/^material[- ]?sakura$/i, 'material-sakura'],
  [/^graphite[- ]?mono$/i, 'graphite-mono'],
  [/^decay[- ]?green$/i, 'decay-green'],
  [/^edge[- ]?runner$/i, 'edge-runner'],
  [/^synth[- ]?wave$/i, 'synth-wave'],
  [/^wallbash[- ]?gtk$/i, 'wallbash'],
  [/^frosted[- ]?glass$/i, 'default-dark'],
]

/**
 * Map a GTK theme name to a built-in preset ID.
 * Returns null if no match is found (caller should fall back to defaults).
 */
export function mapGtkThemeToPreset(gtkThemeName: string): string | null {
  const trimmed = gtkThemeName.trim()
  if (!trimmed) return null

  for (const [pattern, presetId] of GTK_THEME_MAP) {
    if (pattern.test(trimmed)) return presetId
  }

  // Adwaita variants map to defaults
  if (/^adwaita-?dark$/i.test(trimmed)) return 'default-dark'
  if (/^adwaita$/i.test(trimmed)) return 'default-light'

  return null
}

/**
 * Called from main.tsx after detecting the GTK theme name.
 * Stores the mapped preset ID for use in resolveThemeDefinition's system mode.
 */
export function setGtkThemeMapping(gtkThemeName: string) {
  _gtkThemeId = mapGtkThemeToPreset(gtkThemeName)
}

export function resolveThemeDefinition(state: ThemeState): ThemeDefinition {
  const fallbackDark = getThemeById('default-dark') ?? BUILT_IN_THEMES[0]
  const fallbackLight = getThemeById('default-light') ?? fallbackDark
  const found =
    getThemeById(state.activeThemeId) ??
    state.customThemes.find(t => t.id === state.activeThemeId)
  const resolved = found ?? fallbackDark

  if (state.mode === 'light') {
    // Force light: if the active theme is dark/colorful/high-contrast, swap to light fallback
    if (resolved.category !== 'light') return fallbackLight
  } else if (state.mode === 'dark') {
    // Force dark: if the active theme is light, swap to dark fallback
    if (resolved.category === 'light') return fallbackDark
  } else if (state.mode === 'system') {
    // If Wallbash-Gtk is active AND we have live colors, build theme from live wallbash data
    if (_gtkThemeId === 'wallbash' && _wallbashColors) {
      return buildWallbashTheme(_wallbashColors, _wallbashColorScheme)
    }

    // System mode: if the GTK theme maps to a built-in preset, use it.
    // When the GTK preset is dark but COLOR_SCHEME says prefer-light (or vice versa),
    // look up the COUNTERPART_MAP to get the matching light/dark variant.
    if (_gtkThemeId) {
      const gtkTheme = getThemeById(_gtkThemeId)
      if (gtkTheme) {
        const osDark = _osDarkCached ?? detectOsDark()
        const gtkIsDark = gtkTheme.category !== 'light'
        if (!osDark && gtkIsDark) {
          // OS says light, but GTK preset is dark → use light counterpart
          const counterpart = COUNTERPART_MAP[_gtkThemeId]
          if (counterpart) {
            const lightTheme = getThemeById(counterpart)
            if (lightTheme) return lightTheme
          }
          return fallbackLight
        }
        if (osDark && !gtkIsDark) {
          // OS says dark, but GTK preset is light → use dark counterpart
          const counterpart = COUNTERPART_MAP[_gtkThemeId]
          if (counterpart) {
            const darkTheme = getThemeById(counterpart)
            if (darkTheme) return darkTheme
          }
          return fallbackDark
        }
        return gtkTheme
      }
    }

    // Otherwise fall back to dark/light based on OS preference
    const osDark = _osDarkCached ?? detectOsDark()
    const isLightTheme = resolved.category === 'light'
    if (!osDark && !isLightTheme) return fallbackLight
    if (osDark && isLightTheme) return fallbackDark
  }

  return resolved
}

/** Expose the OS dark mode preference for UI consumers (e.g. ThemePicker). */
export function isOsDark(): boolean {
  return _osDarkCached ?? detectOsDark()
}

function detectOsDark(): boolean {
  if (typeof window.matchMedia !== 'function') return true
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const light = window.matchMedia('(prefers-color-scheme: light)').matches
  if (dark) return true
  if (light) return false
  return true
}

// ---------------------------------------------------------------------------
// getActiveSystemTheme — UI helper for system mode rendering
// ---------------------------------------------------------------------------

export interface SystemThemeInfo {
  isLinux: boolean
  isSystemMode: boolean
  activeTheme: ThemeDefinition | null
  activeThemeName: string
}

/**
 * Get info about the active system theme for UI rendering.
 * On Linux: returns the single active GTK theme (or wallbash-live).
 * On other platforms: returns null (UI should show filtered presets).
 */
export function getActiveSystemTheme(state: ThemeState): SystemThemeInfo {
  const isLinux = typeof navigator !== 'undefined' && navigator.userAgent.includes('Linux')
  const isSystemMode = state.mode === 'system'

  if (!isSystemMode) {
    return { isLinux, isSystemMode: false, activeTheme: null, activeThemeName: '' }
  }

  if (!isLinux) {
    // Windows/macOS: no single system card — show filtered presets
    return { isLinux: false, isSystemMode: true, activeTheme: null, activeThemeName: '' }
  }

  // Linux: resolve the active system theme
  const resolved = resolveThemeDefinition(state)
  const displayName = resolved.id === 'wallbash-live'
    ? 'Wallbash'
    : resolved.name

  return {
    isLinux: true,
    isSystemMode: true,
    activeTheme: resolved,
    activeThemeName: displayName,
  }
}

// ---------------------------------------------------------------------------
// deriveAlphaTints
// ---------------------------------------------------------------------------

const ACCENT_TINTS: ReadonlyArray<[string, number]> = [
  ['accent-a10', 0.1],
  ['accent-a12', 0.12],
  ['accent-a15', 0.15],
  ['accent-a30', 0.3],
  ['accent-a40', 0.4],
  ['purple-a08', 0.08],
  ['purple-a10', 0.1],
  ['purple-a12', 0.12],
  ['purple-a15', 0.15],
  ['purple-a20', 0.2],
  ['purple-a30', 0.3],
  ['purple-a40', 0.4],
  ['purple-a55', 0.55],
  ['purple-a75', 0.75],
  ['purple-a90', 0.9],
  ['border-accent', 0.25],
]

export function deriveAlphaTints(hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const el = document.documentElement
  for (const [name, alpha] of ACCENT_TINTS) {
    el.style.setProperty(`--${name}`, `rgba(${r}, ${g}, ${b}, ${alpha})`)
  }
}

// ---------------------------------------------------------------------------
// deriveSecondaryTints
// ---------------------------------------------------------------------------

const SECONDARY_TINTS: ReadonlyArray<[string, number]> = [
  ['secondary-a06', 0.06], ['secondary-a08', 0.08], ['secondary-a12', 0.12],
  ['secondary-a14', 0.14], ['secondary-a15', 0.15], ['secondary-a20', 0.2],
  ['secondary-a25', 0.25], ['secondary-a30', 0.3], ['secondary-a45', 0.45],
]

const SECONDARY_LEGACY_TINTS: ReadonlyArray<[string, number]> = [
  ['green-400-a06', 0.06], ['green-400-a08', 0.08], ['green-400-a12', 0.12],
  ['green-400-a14', 0.14], ['green-400-a15', 0.15], ['green-400-a30', 0.3],
  ['green-400-a45', 0.45], ['emerald-a12', 0.12], ['emerald-a15', 0.15],
  ['emerald-a20', 0.2], ['green-a12', 0.12], ['green-a15', 0.15], ['green-a25', 0.25],
]

export function deriveSecondaryTints(hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const el = document.documentElement
  for (const [name, alpha] of SECONDARY_TINTS) {
    el.style.setProperty(`--${name}`, `rgba(${r}, ${g}, ${b}, ${alpha})`)
  }
  for (const [name, alpha] of SECONDARY_LEGACY_TINTS) {
    el.style.setProperty(`--${name}`, `rgba(${r}, ${g}, ${b}, ${alpha})`)
  }
}

// ---------------------------------------------------------------------------
// deriveTertiaryTints
// ---------------------------------------------------------------------------

const TERTIARY_TINTS: ReadonlyArray<[string, number]> = [
  ['tertiary-a12', 0.12], ['tertiary-a15', 0.15],
]

const TERTIARY_LEGACY_TINTS: ReadonlyArray<[string, number]> = [
  ['blue-a12', 0.12], ['blue-a15', 0.15],
]

export function deriveTertiaryTints(hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const el = document.documentElement
  for (const [name, alpha] of TERTIARY_TINTS) {
    el.style.setProperty(`--${name}`, `rgba(${r}, ${g}, ${b}, ${alpha})`)
  }
  for (const [name, alpha] of TERTIARY_LEGACY_TINTS) {
    el.style.setProperty(`--${name}`, `rgba(${r}, ${g}, ${b}, ${alpha})`)
  }
}

// ---------------------------------------------------------------------------
// applyFonts
// ---------------------------------------------------------------------------

const SYSTEM_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const SYSTEM_MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Courier New', monospace"

export function applyFonts(
  fonts: { body?: string; heading?: string; mono?: string; ui?: string } | undefined,
  globalOverride?: boolean,
): void {
  if (!fonts) {
    if (globalOverride) return
    return
  }
  const el = document.documentElement
  if (fonts.body) el.style.setProperty('--font-body', `${fonts.body}, ${SYSTEM_SANS}`)
  if (fonts.heading) el.style.setProperty('--font-heading', `${fonts.heading}, ${SYSTEM_SANS}`)
  if (fonts.mono) el.style.setProperty('--font-mono', `${fonts.mono}, ${SYSTEM_MONO}`)
  if (fonts.ui) el.style.setProperty('--font-ui', `${fonts.ui}, ${SYSTEM_SANS}`)
}

// ---------------------------------------------------------------------------
// applyFontScale
// ---------------------------------------------------------------------------

const TEXT_SIZES: ReadonlyArray<[string, number]> = [
  ['text-2xs', 9], ['text-xs', 11], ['text-sm', 13], ['text-base', 15],
  ['text-lg', 17], ['text-xl', 20], ['text-2xl', 24], ['text-3xl', 28],
]

export function applyFontScale(scale: number | undefined): void {
  const s = Math.max(0.8, Math.min(1.2, scale ?? 1.0))
  const el = document.documentElement
  for (const [name, base] of TEXT_SIZES) {
    const scaled = Math.round(base * s * 10) / 10
    el.style.setProperty(`--${name}`, `${scaled}px`)
  }
}

// ---------------------------------------------------------------------------
// performRippleTransition
// ---------------------------------------------------------------------------

const isWebKitGTK =
  typeof window !== 'undefined' &&
  !!(window as Record<string, unknown>).__TAURI_INTERNALS__ &&
  typeof navigator !== 'undefined' &&
  /Linux/.test(navigator.userAgent)

function performOverlayRipple(applyFn: () => void, x: number, y: number): void {
  const oldBg =
    getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim() || '#1a1a2e'
  applyFn()
  const overlay = document.createElement('div')
  overlay.style.cssText =
    `position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:${oldBg}`
  document.body.appendChild(overlay)
  const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const duration = 420
  const feather = 24
  const start = performance.now()
  const tick = (now: number) => {
    const t = Math.min((now - start) / duration, 1)
    const ease = 1 - (1 - t) * (1 - t) * (1 - t)
    const r = ease * maxR
    const inner = Math.max(0, r - feather)
    const mask = `radial-gradient(circle ${r}px at ${x}px ${y}px, transparent ${inner}px, black ${r}px)`
    overlay.style.maskImage = mask
    overlay.style.webkitMaskImage = mask
    if (t < 1) requestAnimationFrame(tick)
    else overlay.remove()
  }
  requestAnimationFrame(tick)
}

export function performRippleTransition(applyFn: () => void, x: number, y: number): void {
  if (isWebKitGTK) { performOverlayRipple(applyFn, x, y); return }
  if (typeof document.startViewTransition !== 'function') { applyFn(); return }
  try {
    const transition = document.startViewTransition(() => { flushSync(applyFn) })
    const right = window.innerWidth - x
    const bottom = window.innerHeight - y
    const maxRadius = Math.hypot(Math.max(x, right), Math.max(y, bottom))
    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] },
        { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    }).catch(() => {})
  } catch { applyFn() }
}

// ---------------------------------------------------------------------------
// applyAdvancedOverrides — glow opacity, border radius, panel opacity
// ---------------------------------------------------------------------------

function parseRgbaAlpha(rgba: string, newAlpha: number): string {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return rgba
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${newAlpha})`
}

export function applyAdvancedOverrides(
  overrides: UserThemeOverrides | undefined,
  def: ThemeDefinition,
  isLight: boolean,
): void {
  const el = document.documentElement

  // Glow opacity
  const glowOpacity = overrides?.glowOpacity ?? (isLight ? 0.06 : 0.10)
  el.style.setProperty('--glow-opacity', String(glowOpacity))

  // Border radius — scale proportionally from --radius-sm through --radius-xl
  if (overrides?.borderRadius != null) {
    const val = overrides.borderRadius
    el.style.setProperty('--radius-sm', `${Math.max(0, val - 4)}px`)
    el.style.setProperty('--radius-md', `${val}px`)
    el.style.setProperty('--radius-lg', `${val + 4}px`)
    el.style.setProperty('--radius-xl', `${val + 8}px`)
  }

  // Panel opacity — replace alpha channel of glass-bg and bg-panel
  if (overrides?.panelOpacity != null) {
    const alpha = overrides.panelOpacity
    const glassBg = def.colors['glass-bg'] ?? 'rgba(18, 18, 24, 0.6)'
    const bgPanel = def.colors['bg-panel'] ?? 'rgba(18, 18, 22, 0.72)'
    el.style.setProperty('--glass-bg', parseRgbaAlpha(glassBg, alpha))
    el.style.setProperty('--bg-panel', parseRgbaAlpha(bgPanel, alpha))
  }
}

// ---------------------------------------------------------------------------
// applyTheme — main orchestrator
// ---------------------------------------------------------------------------

export function applyTheme(
  state: ThemeState,
  clickEvent?: { clientX: number; clientY: number },
): void {
  const def = resolveThemeDefinition(state)
  const overrides = state.overrides[state.activeThemeId]
  const el = document.documentElement

  const apply = () => {
    for (const [key, value] of Object.entries(def.colors)) {
      el.style.setProperty(`--${key}`, value)
    }
    if (def.colors['bg-card-solid']) {
      el.style.setProperty('--bg-card', def.colors['bg-card-solid'])
    }

    const accent = overrides?.accent ?? def.colors.accent
    applyAccentColor(accent)

    if (overrides?.glow) {
      applyGlowColor(overrides.glow)
    } else {
      el.style.setProperty('--glow-top-rgb', def.colors['glow-top-rgb'] ?? '139, 92, 246')
    }

    // 4. Apply secondary color (green/functional/status)
    const secondary = overrides?.secondary ?? def.colors['green'] ?? '#34d399'
    applySecondaryColor(secondary)
    deriveSecondaryTints(secondary)

    // 4b. Apply tertiary color (blue/chat/dashboard accents)
    const tertiary = overrides?.tertiary ?? def.colors['accent-secondary'] ?? accent
    applyTertiaryColor(tertiary)
    deriveTertiaryTints(tertiary)

    const logo = overrides?.logo ?? def.colors.accent
    applyLogoColor(logo)

    deriveAlphaTints(accent)

    const isLight = def.category === 'light'
    el.style.setProperty('--bg-white-03', isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)')
    el.style.setProperty('--bg-white-05', isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)')

    el.dataset.theme = def.category === 'light' ? 'light' : 'dark'
    el.style.colorScheme = def.category === 'light' ? 'light' : 'dark'
    el.dataset.themeId = def.id

    applyFonts(overrides?.fonts ?? def.fonts, state.globalFontOverride)
    applyFontScale(overrides?.fontScale ?? def.fontScale)

    applyAdvancedOverrides(overrides, def, isLight)
  }

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (clickEvent && typeof document.startViewTransition === 'function' && !prefersReducedMotion) {
    performRippleTransition(apply, clickEvent.clientX, clickEvent.clientY)
  } else {
    apply()
  }
}
