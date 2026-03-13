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
})
