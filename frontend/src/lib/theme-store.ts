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
import { COUNTERPART_MAP } from './theme-definitions'
import { applyTheme } from './theme-engine'

const STORAGE_KEY = 'theme-state'
type ThemeMode = ThemeState['mode']

const DEFAULT_STATE: ThemeState = {
  mode: 'dark',
  activeThemeId: 'default-dark',
  overrides: {},
  customThemes: [],
}

function normalizeThemeState(state: Partial<ThemeState>): ThemeState {
  return {
    ...DEFAULT_STATE,
    ...state,
    overrides: state.overrides ?? {},
    customThemes: state.customThemes ?? [],
  }
}

function parseThemeMode(raw: string | null): ThemeMode | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed === 'dark' || parsed === 'light' || parsed === 'system') return parsed
  } catch {
    // Fall through to raw string handling.
  }
  if (raw === 'dark' || raw === 'light' || raw === 'system') return raw
  return null
}

function stateWithMode(state: ThemeState, mode: ThemeMode): ThemeState {
  let activeThemeId = state.activeThemeId
  if (
    mode !== 'system' &&
    state.mode !== 'system' &&
    state.mode !== mode
  ) {
    activeThemeId = COUNTERPART_MAP[state.activeThemeId] ?? (mode === 'dark' ? 'default-dark' : 'default-light')
  }

  const next = {
    ...state,
    mode,
    activeThemeId,
    lastModified: Date.now(),
  }
  if (mode === 'system') {
    delete next.blendPosition
  }
  return next
}

function promoteLegacyThemeMode(state: ThemeState): ThemeState {
  const legacyMode = parseThemeMode(localStorage.getItem('theme'))
  if (!legacyMode) return state

  const next = legacyMode === state.mode
    ? state
    : stateWithMode(state, legacyMode)

  if (next !== state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  localStorage.removeItem('theme')
  return next
}

function loadInitialState(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ThemeState
      // Ensure required fields exist (defensive against partial data)
      return promoteLegacyThemeMode(normalizeThemeState(parsed))
    }
  } catch { /* fallback to default */ }
  return promoteLegacyThemeMode({ ...DEFAULT_STATE })
}

let _state: ThemeState = loadInitialState()
const _listeners = new Set<() => void>()
let _themeDraftBase: ThemeState | null = null
let _themeDraftUndoStack: ThemeState[] = []
let _themeDraftRedoStack: ThemeState[] = []

/** Temporary storage for ripple animation click coordinates */
export let _lastClickEvent: { clientX: number; clientY: number } | undefined

function cloneThemeState(state: ThemeState): ThemeState {
  return JSON.parse(JSON.stringify(state)) as ThemeState
}

function persist() {
  if (!_themeDraftBase) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state))
  }
  _listeners.forEach(fn => fn())
}

function mutate(updater: (s: ThemeState) => ThemeState) {
  if (_themeDraftBase) {
    _themeDraftUndoStack.push(cloneThemeState(_state))
    _themeDraftRedoStack = []
  }
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

export function hydrateThemeState(state: Partial<ThemeState>) {
  _state = normalizeThemeState(state)
  _themeDraftBase = null
  _themeDraftUndoStack = []
  _themeDraftRedoStack = []
  _listeners.forEach(fn => fn())
  applyThemeFromState()
}

// ---------------------------------------------------------------------------
// Draft API
// ---------------------------------------------------------------------------

export function startThemeDraft() {
  if (_themeDraftBase) return
  _themeDraftBase = cloneThemeState(_state)
  _themeDraftUndoStack = []
  _themeDraftRedoStack = []
}

export function hasThemeDraft() {
  return Boolean(_themeDraftBase)
}

export function commitThemeDraft() {
  if (!_themeDraftBase) return false
  _themeDraftBase = null
  _themeDraftUndoStack = []
  _themeDraftRedoStack = []
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_state))
  _listeners.forEach(fn => fn())
  applyThemeFromState()
  return true
}

export function discardThemeDraft() {
  if (!_themeDraftBase) return false
  _state = cloneThemeState(_themeDraftBase)
  _themeDraftBase = null
  _themeDraftUndoStack = []
  _themeDraftRedoStack = []
  _listeners.forEach(fn => fn())
  applyThemeFromState()
  return true
}

export function undoThemeDraft() {
  if (!_themeDraftBase || _themeDraftUndoStack.length === 0) return false
  _themeDraftRedoStack.push(cloneThemeState(_state))
  _state = cloneThemeState(_themeDraftUndoStack.pop()!)
  _listeners.forEach(fn => fn())
  applyThemeFromState()
  return true
}

export function redoThemeDraft() {
  if (!_themeDraftBase || _themeDraftRedoStack.length === 0) return false
  _themeDraftUndoStack.push(cloneThemeState(_state))
  _state = cloneThemeState(_themeDraftRedoStack.pop()!)
  _listeners.forEach(fn => fn())
  applyThemeFromState()
  return true
}

// ---------------------------------------------------------------------------
// Mutation API
// ---------------------------------------------------------------------------

export function setActiveTheme(id: string, clickEvent?: { clientX: number; clientY: number }) {
  _lastClickEvent = clickEvent
  mutate(s => ({ ...s, activeThemeId: id }))
  applyThemeFromState(clickEvent)
}

export function setMode(mode: 'dark' | 'light' | 'system') {
  mutate(s => stateWithMode(s, mode))
  applyThemeFromState()
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const order: ThemeMode[] = ['dark', 'light', 'system']
  return order[(order.indexOf(mode) + 1) % order.length]
}

export function cycleThemeMode(): ThemeMode {
  const next = nextThemeMode(_state.mode)
  setMode(next)
  return next
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
  applyThemeFromState()
}

export function setGlowOverride(color: string) {
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), glow: color }
    return withOverride(s, ov)
  })
  applyThemeFromState()
}

export function setSecondaryOverride(color: string) {
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), secondary: color }
    return withOverride(s, ov)
  })
  applyThemeFromState()
}

export function setTertiaryOverride(color: string) {
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), tertiary: color }
    return withOverride(s, ov)
  })
  applyThemeFromState()
}

export function setLogoOverride(color: string) {
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), logo: color }
    return withOverride(s, ov)
  })
  applyThemeFromState()
}

export function setGlowOpacity(opacity: number) {
  const clamped = Math.max(0, Math.min(0.25, opacity))
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), glowOpacity: clamped }
    return withOverride(s, ov)
  })
  applyThemeFromState()
}

export function setBorderRadius(radius: number) {
  const clamped = Math.max(0, Math.min(24, radius))
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), borderRadius: clamped }
    return withOverride(s, ov)
  })
  applyThemeFromState()
}

export function setPanelOpacity(opacity: number) {
  const clamped = Math.max(0.4, Math.min(1.0, opacity))
  mutate(s => {
    const ov = { ...getOrCreateOverride(s), panelOpacity: clamped }
    return withOverride(s, ov)
  })
  applyThemeFromState()
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

export function setUseGtkTheme(enabled: boolean) {
  mutate(s => ({ ...s, useGtkTheme: enabled }))
  applyThemeFromState()
}

export function setBlendPosition(position: number | undefined) {
  if (position === undefined) {
    mutate(s => {
      const next = { ...s }
      delete next.blendPosition
      return next
    })
  } else {
    const clamped = Math.max(0, Math.min(1, position))
    mutate(s => ({ ...s, blendPosition: clamped }))
  }
  applyThemeFromState()
}

// ---------------------------------------------------------------------------
// Theme Application
// ---------------------------------------------------------------------------

/**
 * Apply the full theme-state to the DOM via theme-engine.
 * Uses the stored click event for ripple animation when available.
 */
export function applyThemeFromState(clickEvent?: { clientX: number; clientY: number }, crossfade?: boolean) {
  if (typeof document === 'undefined') return
  applyTheme(_state, clickEvent, crossfade)
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribeTheme, getThemeState)
}
