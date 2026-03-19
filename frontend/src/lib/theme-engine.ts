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
// Cache the OS dark preference — updated by detectSystemDarkMode() and the
// matchMedia listener registered in main.tsx.
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
    // Use cached OS preference (set from Tauri window.theme() or matchMedia)
    const osDark = _osDarkCached ?? detectOsDark()
    const isLightTheme = resolved.category === 'light'

    if (!osDark && !isLightTheme) {
      return getThemeById('default-light') ?? fallback
    }
    if (osDark && isLightTheme) {
      return fallback // default-dark
    }
  }

  return resolved
}

/**
 * Synchronous fallback for OS dark mode detection via matchMedia.
 * Used when the async Tauri detection hasn't populated the cache yet.
 */
function detectOsDark(): boolean {
  if (typeof window.matchMedia !== 'function') return true // default to dark
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const light = window.matchMedia('(prefers-color-scheme: light)').matches
  if (dark) return true
  if (light) return false
  return true // no preference → default dark (most Linux desktops are dark)
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
 * Detect webkit2gtk (Tauri's WebView on Linux). Its startViewTransition
 * crashes the renderer when flushSync mutates the DOM inside the callback.
 *
 * webkit2gtk UA doesn't contain "WebKitGTK" — it looks like a normal Safari UA.
 * Detect via Tauri internals + Linux platform instead.
 */
const isWebKitGTK =
  typeof window !== 'undefined' &&
  !!(window as Record<string, unknown>).__TAURI_INTERNALS__ &&
  typeof navigator !== 'undefined' &&
  /Linux/.test(navigator.userAgent)

/**
 * Overlay-based ripple for webkit2gtk where View Transitions API crashes.
 *
 * Strategy: apply the new theme to the real DOM immediately, then place a
 * full-screen overlay painted with the OLD bg-base on top. A radial CSS mask
 * cuts a circular hole in that overlay, expanding from the click point via
 * requestAnimationFrame. The hole has a soft feathered edge (24px gradient
 * band) so it looks like a ripple wave, not a hard cutout.
 */
function performOverlayRipple(applyFn: () => void, x: number, y: number): void {
  // 1. Snapshot old background before any changes
  const oldBg =
    getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim() ||
    '#1a1a2e'

  // 2. Apply the new theme to the real DOM
  applyFn()

  // 3. Overlay the old bg on top — the mask will punch a growing hole
  const overlay = document.createElement('div')
  overlay.style.cssText =
    `position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:${oldBg}`
  document.body.appendChild(overlay)

  // 4. Animate: expand a feathered circular hole from the click point
  const maxR = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )
  const duration = 420
  const feather = 24 // px of soft edge
  const start = performance.now()

  const tick = (now: number) => {
    const t = Math.min((now - start) / duration, 1)
    // ease-out cubic for a natural deceleration
    const ease = 1 - (1 - t) * (1 - t) * (1 - t)
    const r = ease * maxR
    const inner = Math.max(0, r - feather)
    // transparent inside the hole, solid outside — feathered edge between
    const mask =
      `radial-gradient(circle ${r}px at ${x}px ${y}px, transparent ${inner}px, black ${r}px)`
    overlay.style.maskImage = mask
    overlay.style.webkitMaskImage = mask

    if (t < 1) requestAnimationFrame(tick)
    else overlay.remove()
  }

  requestAnimationFrame(tick)
}

/**
 * Animate theme switch using View Transitions API with a circular clip-path
 * expanding from the click coordinates. On webkit2gtk (Tauri/Linux), uses
 * an overlay-based fallback. Falls back to instant apply if all else fails.
 */
export function performRippleTransition(
  applyFn: () => void,
  x: number,
  y: number,
): void {
  // webkit2gtk: use overlay fallback (startViewTransition crashes the renderer)
  if (isWebKitGTK) {
    performOverlayRipple(applyFn, x, y)
    return
  }

  // Feature-detect View Transitions API
  if (typeof document.startViewTransition !== 'function') {
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

    // 4. Apply secondary accent — derive from theme accent when not explicitly set
    const secondary = overrides?.secondary ?? def.colors['accent-secondary'] ?? accent
    applySecondaryColor(secondary)

    // 5. Apply logo color
    const logo = overrides?.logo ?? def.colors.accent
    applyLogoColor(logo)

    // 6. Regenerate alpha tints from the active accent
    deriveAlphaTints(accent)

    // 6b. Derive theme-adaptive utility variables
    const isLight = def.category === 'light'
    el.style.setProperty('--bg-white-03', isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)')
    el.style.setProperty('--bg-white-05', isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)')

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
