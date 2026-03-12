// Module-level cache for instant page navigation
// Data persists in memory across client-side navigations, cleared on full reload

const cache = new Map<string, unknown>()

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  return entry !== undefined ? (entry as T) : null
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, data)
}
