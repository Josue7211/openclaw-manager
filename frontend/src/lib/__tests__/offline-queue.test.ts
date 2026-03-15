import { describe, it, expect, vi, beforeEach } from 'vitest'

let getQueue: typeof import('../offline-queue').getQueue
let getQueueLength: typeof import('../offline-queue').getQueueLength
let queueMutation: typeof import('../offline-queue').queueMutation
let clearQueue: typeof import('../offline-queue').clearQueue
let processQueue: typeof import('../offline-queue').processQueue
let subscribeQueue: typeof import('../offline-queue').subscribeQueue

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('../offline-queue')
  getQueue = mod.getQueue
  getQueueLength = mod.getQueueLength
  queueMutation = mod.queueMutation
  clearQueue = mod.clearQueue
  processQueue = mod.processQueue
  subscribeQueue = mod.subscribeQueue
})

describe('getQueue', () => {
  it('returns empty array when localStorage is empty', () => {
    expect(getQueue()).toEqual([])
  })

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('offline-mutation-queue', 'not-json')
    expect(getQueue()).toEqual([])
  })

  it('returns stored queue entries', () => {
    const entries = [
      { id: '1', endpoint: '/api/test', method: 'POST', body: { x: 1 }, timestamp: 1000, retries: 0 },
    ]
    localStorage.setItem('offline-mutation-queue', JSON.stringify(entries))
    expect(getQueue()).toEqual(entries)
  })
})

describe('getQueueLength', () => {
  it('returns 0 when queue is empty', () => {
    expect(getQueueLength()).toBe(0)
  })

  it('returns correct count after queuing mutations', () => {
    queueMutation('/api/a', 'POST', { x: 1 })
    queueMutation('/api/b', 'PATCH', { x: 2 })
    expect(getQueueLength()).toBe(2)
  })
})

describe('queueMutation', () => {
  it('adds a mutation entry to the queue', () => {
    queueMutation('/api/todos', 'POST', { title: 'Test' })
    const queue = getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].endpoint).toBe('/api/todos')
    expect(queue[0].method).toBe('POST')
    expect(queue[0].body).toEqual({ title: 'Test' })
    expect(queue[0].retries).toBe(0)
  })

  it('generates a unique ID for each entry', () => {
    queueMutation('/api/a', 'POST')
    queueMutation('/api/b', 'POST')
    const queue = getQueue()
    expect(queue[0].id).not.toBe(queue[1].id)
  })

  it('sets a timestamp', () => {
    const before = Date.now()
    queueMutation('/api/test', 'DELETE')
    const queue = getQueue()
    expect(queue[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(queue[0].timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('persists to localStorage', () => {
    queueMutation('/api/test', 'PATCH', { done: true })
    const stored = JSON.parse(localStorage.getItem('offline-mutation-queue')!)
    expect(stored).toHaveLength(1)
    expect(stored[0].endpoint).toBe('/api/test')
  })

  it('supports all HTTP methods: POST, PATCH, DELETE', () => {
    queueMutation('/api/a', 'POST', {})
    queueMutation('/api/b', 'PATCH', {})
    queueMutation('/api/c', 'DELETE', {})
    const queue = getQueue()
    expect(queue.map(q => q.method)).toEqual(['POST', 'PATCH', 'DELETE'])
  })

  it('works without a body', () => {
    queueMutation('/api/test', 'DELETE')
    const queue = getQueue()
    expect(queue[0].body).toBeUndefined()
  })
})

describe('clearQueue', () => {
  it('removes all entries from localStorage', () => {
    queueMutation('/api/a', 'POST')
    queueMutation('/api/b', 'POST')
    clearQueue()
    expect(getQueue()).toEqual([])
    expect(localStorage.getItem('offline-mutation-queue')).toBeNull()
  })

  it('notifies subscribers', () => {
    const cb = vi.fn()
    subscribeQueue(cb)
    queueMutation('/api/test', 'POST') // this also notifies
    cb.mockClear()
    clearQueue()
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('subscribeQueue', () => {
  it('fires callback when a mutation is queued', () => {
    const cb = vi.fn()
    subscribeQueue(cb)
    queueMutation('/api/test', 'POST')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires callback when queue is cleared', () => {
    const cb = vi.fn()
    subscribeQueue(cb)
    clearQueue()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('returns an unsubscribe function', () => {
    const cb = vi.fn()
    const unsub = subscribeQueue(cb)
    unsub()
    queueMutation('/api/test', 'POST')
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('processQueue', () => {
  it('does nothing when queue is empty', async () => {
    await processQueue() // should not throw
    expect(getQueue()).toEqual([])
  })

  it('replays queued mutations via api and removes successful ones', async () => {
    const mockPost = vi.fn().mockResolvedValue({})
    const mockPatch = vi.fn().mockResolvedValue({})
    const mockDel = vi.fn().mockResolvedValue({})

    vi.doMock('../api', () => ({
      api: { post: mockPost, patch: mockPatch, del: mockDel },
    }))

    // Re-import to pick up the mock
    vi.resetModules()
    vi.doMock('../api', () => ({
      api: { post: mockPost, patch: mockPatch, del: mockDel },
    }))
    const mod = await import('../offline-queue')

    mod.queueMutation('/api/a', 'POST', { x: 1 })
    mod.queueMutation('/api/b', 'PATCH', { y: 2 })
    mod.queueMutation('/api/c', 'DELETE', { z: 3 })

    await mod.processQueue()

    expect(mockPost).toHaveBeenCalledWith('/api/a', { x: 1 })
    expect(mockPatch).toHaveBeenCalledWith('/api/b', { y: 2 })
    expect(mockDel).toHaveBeenCalledWith('/api/c', { z: 3 })
    expect(mod.getQueue()).toEqual([])
  })

  it('retains failed mutations with incremented retry count', async () => {
    const mockPost = vi.fn().mockRejectedValue(new Error('network error'))

    vi.resetModules()
    vi.doMock('../api', () => ({
      api: { post: mockPost, patch: vi.fn(), del: vi.fn() },
    }))
    const mod = await import('../offline-queue')

    mod.queueMutation('/api/a', 'POST', {})
    await mod.processQueue()

    const queue = mod.getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].retries).toBe(1)
  })

  it('discards mutations that exceed max retries (5)', async () => {
    const mockPost = vi.fn().mockRejectedValue(new Error('fail'))

    vi.resetModules()
    vi.doMock('../api', () => ({
      api: { post: mockPost, patch: vi.fn(), del: vi.fn() },
    }))
    const mod = await import('../offline-queue')

    // Manually seed an entry with 4 retries
    const entry = {
      id: 'test-1',
      endpoint: '/api/a',
      method: 'POST' as const,
      body: {},
      timestamp: Date.now(),
      retries: 4,
    }
    localStorage.setItem('offline-mutation-queue', JSON.stringify([entry]))

    await mod.processQueue()

    // retries would become 5, which equals MAX_RETRIES — discarded
    expect(mod.getQueue()).toEqual([])
  })

  it('keeps entries below max retries and discards those at max', async () => {
    const mockPost = vi.fn().mockRejectedValue(new Error('fail'))
    const mockPatch = vi.fn().mockRejectedValue(new Error('fail'))

    vi.resetModules()
    vi.doMock('../api', () => ({
      api: { post: mockPost, patch: mockPatch, del: vi.fn() },
    }))
    const mod = await import('../offline-queue')

    const entries = [
      { id: '1', endpoint: '/api/a', method: 'POST' as const, body: {}, timestamp: Date.now(), retries: 4 },
      { id: '2', endpoint: '/api/b', method: 'PATCH' as const, body: {}, timestamp: Date.now(), retries: 2 },
    ]
    localStorage.setItem('offline-mutation-queue', JSON.stringify(entries))

    await mod.processQueue()

    const queue = mod.getQueue()
    // First entry: retries 4 -> 5 (>= MAX_RETRIES=5) -> discarded
    // Second entry: retries 2 -> 3 (< 5) -> kept
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe('2')
    expect(queue[0].retries).toBe(3)
  })
})
