// Module-level cache for instant page navigation
// Data persists in memory across client-side navigations, cleared on full reload

import { useSyncExternalStore, useCallback } from 'react'

interface CacheEntry { data: unknown; ts: number }

const cache = new Map<string, CacheEntry>()

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

// --- Subscriber infrastructure for useSyncExternalStore ---
const _listeners = new Set<() => void>()
let _generation = 0

function notifyListeners() {
  _generation++
  _listeners.forEach(fn => fn())
}

function subscribe(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

function getSnapshot(): number {
  return _generation
}

// --- Public API (backward-compatible) ---

export function getCached<T>(key: string, ttlMs: number = DEFAULT_TTL): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > ttlMs) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() })
  notifyListeners()
}

export function clearPageCache(key: string): void {
  cache.delete(key)
  notifyListeners()
}

// --- usePageState hook ---

/**
 * React hook for preserving page/form state across navigation.
 * Uses the in-memory cache (not localStorage) -- ephemeral within a session.
 * Reactivity via useSyncExternalStore so multiple components sharing a key stay in sync.
 */
export function usePageState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  // Subscribe to cache changes -- re-renders when any cache entry changes
  useSyncExternalStore(subscribe, getSnapshot)

  const current = getCached<T>(key)
  const value = current !== null ? current : initialValue

  const setValue = useCallback((update: T | ((prev: T) => T)) => {
    const prev = getCached<T>(key) ?? initialValue
    const next = typeof update === 'function'
      ? (update as (prev: T) => T)(prev)
      : update
    setCache(key, next)
  }, [key, initialValue])

  return [value, setValue]
}
