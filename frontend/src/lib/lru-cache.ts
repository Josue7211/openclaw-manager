/**
 * Minimal generic LRU (Least Recently Used) cache.
 *
 * Built on top of Map's insertion-order guarantee: on every `get` hit the
 * entry is deleted and re-inserted so it moves to the "most recently used"
 * end. Eviction always removes from the front (least recently used).
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>()

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const val = this.map.get(key)
    if (val !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key)
      this.map.set(key, val)
    }
    return val
  }

  set(key: K, val: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, val)
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value!
      this.map.delete(oldest)
    }
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  get size(): number {
    return this.map.size
  }
}
