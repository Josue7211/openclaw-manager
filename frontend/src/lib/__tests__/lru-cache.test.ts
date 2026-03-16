import { describe, it, expect } from 'vitest'
import { LRUCache } from '../lru-cache'

describe('LRUCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBe(2)
    expect(cache.size).toBe(2)
  })

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string, number>(3)
    expect(cache.get('nope')).toBeUndefined()
  })

  it('reports has() correctly', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('x', 42)
    expect(cache.has('x')).toBe(true)
    expect(cache.has('y')).toBe(false)
  })

  it('evicts the least recently used entry when maxSize is exceeded', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // Cache is full (3/3). Adding 'd' should evict 'a' (oldest).
    cache.set('d', 4)
    expect(cache.has('a')).toBe(false)
    expect(cache.size).toBe(3)
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('promotes entries on get so they are not evicted', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // Access 'a' to promote it — 'b' is now the least recently used
    cache.get('a')
    cache.set('d', 4)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false) // 'b' was evicted
    expect(cache.get('a')).toBe(1)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('overwrites existing keys without growing size', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 10) // overwrite
    expect(cache.get('a')).toBe(10)
    expect(cache.size).toBe(2)
  })

  it('overwriting moves the key to most-recently-used position', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // Overwrite 'a' — now 'b' is least recently used
    cache.set('a', 10)
    cache.set('d', 4)
    expect(cache.has('b')).toBe(false) // 'b' evicted
    expect(cache.has('a')).toBe(true)
    expect(cache.get('a')).toBe(10)
  })

  it('works with a maxSize of 1', () => {
    const cache = new LRUCache<string, string>(1)
    cache.set('a', 'first')
    expect(cache.get('a')).toBe('first')
    cache.set('b', 'second')
    expect(cache.has('a')).toBe(false)
    expect(cache.get('b')).toBe('second')
    expect(cache.size).toBe(1)
  })

  it('handles non-string keys', () => {
    const cache = new LRUCache<number, string>(2)
    cache.set(1, 'one')
    cache.set(2, 'two')
    cache.set(3, 'three')
    expect(cache.has(1)).toBe(false)
    expect(cache.get(2)).toBe('two')
    expect(cache.get(3)).toBe('three')
  })

  it('get on a missing key does not affect eviction order', () => {
    const cache = new LRUCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('nonexistent') // should be a no-op
    cache.set('c', 3) // should evict 'a', not 'b'
    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(true)
  })
})
