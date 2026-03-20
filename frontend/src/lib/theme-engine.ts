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
import { BUILT_IN_THEMES, getThemeById } from './theme-definitions'
import type { ThemeDefinition, ThemeState, UserThemeOverrides } from './theme-definitions'
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

/** Called from main.tsx on startup and whenever the system theme changes. */
export function setOsDarkPreference(dark: boolean) {
  _osDarkCached = dark
}

export function resolveThemeDefinition(state: ThemeState): ThemeDefinition {
  const fallback = getThemeById('default-dark') ?? BUILT_IN_THEMES[0]
  const found =
    getThemeById(state.activeThemeId) ??
    state.customThemes.find(t => t.id === state.activeThemeId)
  const resolved = found ?? fallback

  if (state.mode === 'system') {
    const osDark = _osDarkCached ?? detectOsDark()
    const isLightTheme = resolved.category === 'light'
    if (!osDark && !isLightTheme) return getThemeById('default-light') ?? fallback
    if (osDark && isLightTheme) return fallback
  }

  return resolved
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
