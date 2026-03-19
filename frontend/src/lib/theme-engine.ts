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
import type { ThemeDefinition, ThemeState } from './theme-definitions'
import {
  applyAccentColor,
  applyGlowColor,
  applySecondaryColor,
  applyLogoColor,
  DEFAULT_SECONDARY,
} from './themes'

// ---------------------------------------------------------------------------
// resolveThemeDefinition
// ---------------------------------------------------------------------------

/**
 * Determine which ThemeDefinition to apply given the current ThemeState.
 *
 * 1. Look up activeThemeId in BUILT_IN_THEMES, then in customThemes.
 * 2. If mode === 'system', check prefers-color-scheme and swap to the
 *    appropriate default if the resolved theme's category doesn't match.
 * 3. Fallback to default-dark if nothing matches.
 */
export function resolveThemeDefinition(state: ThemeState): ThemeDefinition {
  const fallback = getThemeById('default-dark') ?? BUILT_IN_THEMES[0]

  // Look up in built-ins first, then custom themes
  const found =
    getThemeById(state.activeThemeId) ??
    state.customThemes.find(t => t.id === state.activeThemeId)

  const resolved = found ?? fallback

  if (state.mode === 'system') {
    const osLight =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches
    const isLightTheme = resolved.category === 'light'

    if (osLight && !isLightTheme) {
      // OS wants light but theme is dark/colorful/high-contrast-dark
      return getThemeById('default-light') ?? fallback
    }
    if (!osLight && isLightTheme) {
      // OS wants dark but theme is light
      return fallback // default-dark
    }
  }

  return resolved
}

// ---------------------------------------------------------------------------
// deriveAlphaTints
// ---------------------------------------------------------------------------

/** Alpha tint definitions: CSS variable name suffix -> opacity */
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

/**
 * Regenerate all accent-derived alpha tint CSS variables from a hex color.
 * This must be called on every accent change to keep tints in sync.
 */
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
// applyFonts
// ---------------------------------------------------------------------------

const SYSTEM_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const SYSTEM_MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Courier New', monospace"

/**
 * Apply font family overrides to CSS variables.
 */
export function applyFonts(
  fonts: { body?: string; heading?: string; mono?: string; ui?: string } | undefined,
  globalOverride?: boolean,
): void {
  if (!fonts) {
    if (globalOverride) return // Keep current fonts
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

/** Base sizes in px for each --text-* variable at scale 1.0 */
const TEXT_SIZES: ReadonlyArray<[string, number]> = [
  ['text-2xs', 9],
  ['text-xs', 11],
  ['text-sm', 13],
  ['text-base', 15],
  ['text-lg', 17],
  ['text-xl', 20],
  ['text-2xl', 24],
  ['text-3xl', 28],
]

/**
 * Multiply --text-* CSS variables by a scale factor.
 * Does NOT change html font-size (Pitfall #5 prevention).
 */
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

/**
 * Detect WebKitGTK — Tauri's WebView on Linux. Its startViewTransition
 * implementation crashes the renderer when flushSync mutates the DOM
 * inside the transition callback.
 */
const isWebKitGTK =
  typeof navigator !== 'undefined' && /WebKitGTK/.test(navigator.userAgent)

/**
 * Animate theme switch using View Transitions API with a circular clip-path
 * expanding from the click coordinates. Falls back to instant apply if the
 * API is unavailable or an error occurs.
 */
export function performRippleTransition(
  applyFn: () => void,
  x: number,
  y: number,
): void {
  // Feature-detect View Transitions API; skip on WebKitGTK where it crashes
  if (typeof document.startViewTransition !== 'function' || isWebKitGTK) {
    applyFn()
    return
  }

  try {
    const transition = document.startViewTransition(() => {
      flushSync(applyFn)
    })

    // Calculate the maximum radius needed to cover the entire viewport
    const right = window.innerWidth - x
    const bottom = window.innerHeight - y
    const maxRadius = Math.hypot(Math.max(x, right), Math.max(y, bottom))

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 400,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    }).catch(() => {
      // Transition was skipped or cancelled -- theme already applied via flushSync
    })
  } catch {
    // Fallback: apply directly if startViewTransition throws
    applyFn()
  }
}

// ---------------------------------------------------------------------------
// applyTheme — main orchestrator
// ---------------------------------------------------------------------------

/**
 * Apply the full theme to the DOM: CSS variables, accent colors, alpha tints,
 * fonts, font scale, and data attributes. Optionally animate via ripple.
 */
export function applyTheme(
  state: ThemeState,
  clickEvent?: { clientX: number; clientY: number },
): void {
  const def = resolveThemeDefinition(state)
  const overrides = state.overrides[state.activeThemeId]
  const el = document.documentElement

  const apply = () => {
    // 1. Set all CSS custom properties from the preset's colors map
    for (const [key, value] of Object.entries(def.colors)) {
      el.style.setProperty(`--${key}`, value)
    }

    // 2. Apply accent color (user override takes precedence)
    const accent = overrides?.accent ?? def.colors.accent
    applyAccentColor(accent)

    // 3. Apply glow color — theme defs store glow as RGB string ('r, g, b'),
    //    user overrides store as hex. applyGlowColor expects hex, so set
    //    the CSS variable directly when using the theme default.
    if (overrides?.glow) {
      applyGlowColor(overrides.glow)
    } else {
      el.style.setProperty('--glow-top-rgb', def.colors['glow-top-rgb'] ?? '139, 92, 246')
    }

    // 4. Apply secondary accent
    const secondary = overrides?.secondary ?? def.colors['accent-secondary'] ?? DEFAULT_SECONDARY
    applySecondaryColor(secondary)

    // 5. Apply logo color
    const logo = overrides?.logo ?? def.colors.accent
    applyLogoColor(logo)

    // 6. Regenerate alpha tints from the active accent
    deriveAlphaTints(accent)

    // 7. Set data-theme attribute for CSS cascade (light theme overrides in globals.css)
    el.dataset.theme = def.category === 'light' ? 'light' : 'dark'

    // 8. Set data-themeId for component-level queries
    el.dataset.themeId = def.id

    // 9. Apply fonts
    applyFonts(overrides?.fonts ?? def.fonts, state.globalFontOverride)

    // 10. Apply font scale
    applyFontScale(overrides?.fontScale ?? def.fontScale)
  }

  // Decide whether to animate or apply instantly
  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (
    clickEvent &&
    typeof document.startViewTransition === 'function' &&
    !prefersReducedMotion
  ) {
    performRippleTransition(apply, clickEvent.clientX, clickEvent.clientY)
  } else {
    apply()
  }
}
