import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCached, setCache } from '../page-cache'

describe('page-cache', () => {
  beforeEach(() => {
    // Reset timers between tests
    vi.useRealTimers()
  })

  it('returns null for a missing key', () => {
    expect(getCached('nonexistent-key-' + Math.random())).toBeNull()
  })

  it('returns cached data after setCache', () => {
    const key = 'test-key-' + Math.random()
    const data = { name: 'test', items: [1, 2, 3] }
    setCache(key, data)
    expect(getCached(key)).toEqual(data)
  })

  it('returns data with correct type', () => {
    const key = 'typed-key-' + Math.random()
    setCache(key, 42)
    const result = getCached<number>(key)
    expect(result).toBe(42)
  })

  it('returns null for expired entries (default TTL)', () => {
    vi.useFakeTimers()
    const key = 'expire-default-' + Math.random()
    setCache(key, 'will expire')

    // Advance past 5-minute default TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    expect(getCached(key)).toBeNull()
  })

  it('returns null for expired entries (custom TTL)', () => {
    vi.useFakeTimers()
    const key = 'expire-custom-' + Math.random()
    setCache(key, 'short-lived')

    // Advance past custom 1-second TTL
    vi.advanceTimersByTime(1001)

    expect(getCached(key, 1000)).toBeNull()
  })

  it('returns data within TTL window', () => {
    vi.useFakeTimers()
    const key = 'within-ttl-' + Math.random()
    setCache(key, 'still valid')

    // Advance but stay within default TTL
    vi.advanceTimersByTime(4 * 60 * 1000)

    expect(getCached(key)).toBe('still valid')
  })

  it('overwrites previous entry with setCache', () => {
    const key = 'overwrite-' + Math.random()
    setCache(key, 'first')
    setCache(key, 'second')
    expect(getCached(key)).toBe('second')
  })

  it('deletes expired entries from cache on access', () => {
    vi.useFakeTimers()
    const key = 'deleted-' + Math.random()
    setCache(key, 'temp')

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    // First call returns null and deletes the entry
    expect(getCached(key)).toBeNull()
    // Second call should also return null (entry was cleaned up)
    expect(getCached(key)).toBeNull()
  })

  it('handles null and undefined values', () => {
    const key1 = 'null-val-' + Math.random()
    const key2 = 'undef-val-' + Math.random()
    setCache(key1, null)
    setCache(key2, undefined)
    expect(getCached(key1)).toBeNull()
    expect(getCached(key2)).toBeUndefined()
  })

  it('caches complex nested objects', () => {
    const key = 'complex-' + Math.random()
    const data = { nested: { deep: { value: [1, 2, 3] } }, flag: true }
    setCache(key, data)
    expect(getCached(key)).toEqual(data)
  })

  it('caches arrays', () => {
    const key = 'array-' + Math.random()
    const data = [1, 'two', { three: 3 }]
    setCache(key, data)
    expect(getCached(key)).toEqual(data)
  })

  it('returns data when exactly at TTL boundary', () => {
    vi.useFakeTimers()
    const key = 'boundary-' + Math.random()
    setCache(key, 'at-boundary')
    // Advance exactly to TTL (not past it)
    vi.advanceTimersByTime(5 * 60 * 1000)
    // At exactly the boundary, Date.now() - ts === ttlMs, which is NOT > ttlMs
    expect(getCached(key)).toBe('at-boundary')
  })

  it('different keys are independent', () => {
    const key1 = 'indep-a-' + Math.random()
    const key2 = 'indep-b-' + Math.random()
    setCache(key1, 'alpha')
    setCache(key2, 'beta')
    expect(getCached(key1)).toBe('alpha')
    expect(getCached(key2)).toBe('beta')
  })

  it('overwrite resets the TTL', () => {
    vi.useFakeTimers()
    const key = 'reset-ttl-' + Math.random()
    setCache(key, 'first')
    vi.advanceTimersByTime(4 * 60 * 1000) // 4 minutes
    // Overwrite refreshes the timestamp
    setCache(key, 'second')
    vi.advanceTimersByTime(4 * 60 * 1000) // another 4 minutes (8 total)
    // Should still be valid because it was refreshed at minute 4
    expect(getCached(key)).toBe('second')
  })

  it('caches boolean false without treating it as missing', () => {
    const key = 'false-val-' + Math.random()
    setCache(key, false)
    expect(getCached(key)).toBe(false)
  })

  it('caches zero without treating it as missing', () => {
    const key = 'zero-val-' + Math.random()
    setCache(key, 0)
    expect(getCached(key)).toBe(0)
  })

  it('caches empty string without treating it as missing', () => {
    const key = 'empty-str-' + Math.random()
    setCache(key, '')
    expect(getCached(key)).toBe('')
  })
})
