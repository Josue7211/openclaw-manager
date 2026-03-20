/**
 * Animation Intensity Store — controls animation level via useSyncExternalStore.
 *
 * Three levels: 'full', 'reduced', 'none'.
 * Respects prefers-reduced-motion as initial default.
 * Sets data-animation attribute on <html> for CSS selectors.
 *
 * Pattern follows theme-store.ts and sidebar-settings.ts:
 *   - Module-level state + listeners
 *   - Persist to localStorage, notify subscribers, apply to DOM
 */

import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnimationLevel = 'full' | 'reduced' | 'none'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'animation-intensity'
const VALID_LEVELS: readonly AnimationLevel[] = ['full', 'reduced', 'none']

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function getDefaultLevel(): AnimationLevel {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return 'reduced'
  }
  return 'full'
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function loadInitialLevel(): AnimationLevel {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && VALID_LEVELS.includes(stored as AnimationLevel)) {
      return stored as AnimationLevel
    }
  } catch { /* fall through */ }
  return getDefaultLevel()
}

let _level: AnimationLevel = loadInitialLevel()
const _listeners = new Set<() => void>()

// ---------------------------------------------------------------------------
// DOM Application
// ---------------------------------------------------------------------------

function applyToDOM(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-animation', _level)
  }
}

// Apply on initial load
applyToDOM()

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

export function getAnimationIntensity(): AnimationLevel {
  return _level
}

export function subscribeAnimationIntensity(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

export function useAnimationIntensity(): AnimationLevel {
  return useSyncExternalStore(subscribeAnimationIntensity, getAnimationIntensity)
}

// ---------------------------------------------------------------------------
// Mutation API
// ---------------------------------------------------------------------------

export function setAnimationIntensity(level: AnimationLevel): void {
  _level = level
  localStorage.setItem(STORAGE_KEY, level)
  applyToDOM()
  _listeners.forEach(fn => fn())
}

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

/** Returns true if any animation should play (level is not 'none') */
export function shouldAnimate(): boolean {
  return _level !== 'none'
}

/** Returns true if motion should be reduced (level is 'reduced' or 'none') */
export function shouldReduceMotion(): boolean {
  return _level !== 'full'
}
