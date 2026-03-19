/**
 * Theme Store — centralized theme state via useSyncExternalStore.
 *
 * Follows the exact pattern from keybindings.ts and sidebar-settings.ts:
 *   - Module-level _state + _listeners
 *   - persist() writes to localStorage and notifies listeners
 *   - Every mutation updates lastModified for sync conflict resolution
 *   - React components subscribe via useSyncExternalStore(subscribeTheme, getThemeState)
 */

import { useSyncExternalStore } from 'react'
import type { ThemeState, UserThemeOverrides, ThemeDefinition, ThemeSchedule } from './theme-definitions'

const STORAGE_KEY = 'theme-state'

const DEFAULT_STATE: ThemeState = {
  mode: 'dark',
  activeThemeId: 'default-dark',
  overrides: {},
  customThemes: [],
}

function loadInitialState(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ThemeState
      // Ensure required fields exist (defensive against partial data)
      return {
        ...DEFAULT_STATE,
        ...parsed,
        overrides: parsed.overrides ?? {},
        customThemes: parsed.customThemes ?? [],
      }
    }
  } catch { /* fallback to default */ }
  return { ...DEFAULT_STATE }
}

let _state: ThemeState = loadInitialState()
const _listeners = new Set<() => void>()

/** Temporary storage for ripple animation click coordinates */
let _lastClickEvent: { clientX: number; clientY: number } | undefined

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_state))
  _listeners.forEach(fn => fn())
}

function mutate(updater: (s: ThemeState) => ThemeState) {
  _state = { ...updater(_state), lastModified: Date.now() }
  persist()
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

export function getThemeState(): ThemeState {
  return _state
}

export function subscribeTheme(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

/** Get the click event stored for the last theme switch (for ripple animation) */
export function getLastClickEvent() {
  return _lastClickEvent
}

/** Clear the stored click event after the ripple animation consumes it */
export function clearLastClickEvent() {
  _lastClickEvent = undefined
}

// ---------------------------------------------------------------------------
// Mutation API
// ---------------------------------------------------------------------------

export function setActiveTheme(id: string, clickEvent?: { clientX: number; clientY: number }) {
  _lastClickEvent = clickEvent
  mutate(s => ({ ...s, activeThemeId: id }))
}

export function setMode(mode: 'dark' | 'light' | 'system') {
  mutate(s => ({ ...s, mode }))
}

function getOrCreateOverride(state: ThemeState): UserThemeOverrides {
  return state.overrides[state.activeThemeId] ?? { themeId: state.activeThemeId }
}

function withOverride(state: ThemeState, override: UserThemeOverrides): ThemeState {
  return {
    ...state,
    overrides: { ...state.overrides, [state.activeThemeId]: override },
  }
}

export function setAccentOverride(color: string) {
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), accent: color }
    return withOverride(s, ov)
  })
}

export function setGlowOverride(color: string) {
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), glow: color }
    return withOverride(s, ov)
  })
}

export function setSecondaryOverride(color: string) {
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), secondary: color }
    return withOverride(s, ov)
  })
}

export function setLogoOverride(color: string) {
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), logo: color }
    return withOverride(s, ov)
  })
}

export function setFontOverride(slot: 'body' | 'heading' | 'mono' | 'ui', fontFamily: string) {
  mutate(s => {
    const ov = getOrCreateOverride(s)
    const fonts = { ...ov.fonts, [slot]: fontFamily }
    return withOverride(s, { ...ov, fonts })
  })
}

export function setFontScale(scale: number) {
  const clamped = Math.max(0.8, Math.min(1.2, scale))
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), fontScale: clamped }
    return withOverride(s, ov)
  })
}

export function setGlobalFontOverride(enabled: boolean) {
  mutate(s => ({ ...s, globalFontOverride: enabled }))
}

export function addCustomTheme(theme: ThemeDefinition) {
  mutate(s => ({
    ...s,
    customThemes: [...s.customThemes, { ...theme, builtIn: false }],
  }))
}

export function removeCustomTheme(id: string) {
  mutate(s => ({
    ...s,
    customThemes: s.customThemes.filter(t => t.id !== id),
  }))
}

export function setPageOverride(routePath: string, themeId: string) {
  mutate(s => ({
    ...s,
    pageOverrides: { ...s.pageOverrides, [routePath]: themeId },
  }))
}

export function clearPageOverride(routePath: string) {
  mutate(s => {
    const next = { ...s.pageOverrides }
    delete next[routePath]
    return { ...s, pageOverrides: next }
  })
}

export function setCategoryOverride(categoryId: string, themeId: string) {
  mutate(s => ({
    ...s,
    categoryOverrides: { ...s.categoryOverrides, [categoryId]: themeId },
  }))
}

export function clearCategoryOverride(categoryId: string) {
  mutate(s => {
    const next = { ...s.categoryOverrides }
    delete next[categoryId]
    return { ...s, categoryOverrides: next }
  })
}

export function setSchedule(schedule: ThemeSchedule) {
  mutate(s => ({ ...s, schedule }))
}

export function resetThemeOverrides(themeId: string) {
  mutate(s => {
    const next = { ...s.overrides }
    delete next[themeId]
    return { ...s, overrides: next }
  })
}

export function pinTheme(themeId: string) {
  mutate(s => {
    const ov = s.overrides[themeId] ?? { themeId }
    return {
      ...s,
      overrides: { ...s.overrides, [themeId]: { ...ov, pinned: true } },
    }
  })
}

export function unpinTheme(themeId: string) {
  mutate(s => {
    const ov = s.overrides[themeId] ?? { themeId }
    return {
      ...s,
      overrides: { ...s.overrides, [themeId]: { ...ov, pinned: false } },
    }
  })
}

// ---------------------------------------------------------------------------
// Theme Application (placeholder — Plan 02 implements full applyTheme)
// ---------------------------------------------------------------------------

/**
 * Apply the theme-state to the DOM.
 * For now, this only sets data-theme attribute for mode.
 * Plan 02-02 will add full CSS custom property application.
 */
export function applyThemeFromState(state?: ThemeState) {
  const s = state ?? _state
  const mode = s.mode
  if (typeof document === 'undefined') return

  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light'
  } else {
    document.documentElement.dataset.theme = mode === 'light' ? 'light' : 'dark'
  }
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribeTheme, getThemeState)
}
