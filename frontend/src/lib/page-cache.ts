// Module-level cache for instant page navigation
// Data persists in memory across client-side navigations, cleared on full reload

interface CacheEntry { data: unknown; ts: number }

const cache = new Map<string, CacheEntry>()

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

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
}
