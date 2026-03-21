import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let incrementUnread: typeof import('../unread-store').incrementUnread
let markRead: typeof import('../unread-store').markRead
let setUnreadCount: typeof import('../unread-store').setUnreadCount
let getUnreadCounts: typeof import('../unread-store').getUnreadCounts
let subscribeUnreadCounts: typeof import('../unread-store').subscribeUnreadCounts

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('../unread-store')
  incrementUnread = mod.incrementUnread
  markRead = mod.markRead
  setUnreadCount = mod.setUnreadCount
  getUnreadCounts = mod.getUnreadCounts
  subscribeUnreadCounts = mod.subscribeUnreadCounts
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('incrementUnread', () => {
  it('increases count for a new href', () => {
    incrementUnread('/messages')
    expect(getUnreadCounts()['/messages']).toBe(1)
  })

  it('increases count for an existing href', () => {
    incrementUnread('/messages')
    incrementUnread('/messages')
    expect(getUnreadCounts()['/messages']).toBe(2)
  })

  it('increases by a custom amount', () => {
    incrementUnread('/missions', 5)
    expect(getUnreadCounts()['/missions']).toBe(5)
  })

  it('notifies listeners on increment', () => {
    const listener = vi.fn()
    subscribeUnreadCounts(listener)
    incrementUnread('/messages')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('markRead', () => {
  it('clears count for a href', () => {
    incrementUnread('/messages')
    incrementUnread('/messages')
    markRead('/messages')
    expect(getUnreadCounts()['/messages']).toBeUndefined()
  })

  it('does nothing for unknown href', () => {
    const listener = vi.fn()
    subscribeUnreadCounts(listener)
    markRead('/unknown')
    // Should not notify since nothing changed
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies listeners when clearing', () => {
    incrementUnread('/messages')
    const listener = vi.fn()
    subscribeUnreadCounts(listener)
    markRead('/messages')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('setUnreadCount', () => {
  it('sets exact value for a href', () => {
    setUnreadCount('/todos', 7)
    expect(getUnreadCounts()['/todos']).toBe(7)
  })

  it('removes entry when set to 0', () => {
    incrementUnread('/todos')
    setUnreadCount('/todos', 0)
    expect(getUnreadCounts()['/todos']).toBeUndefined()
  })

  it('removes entry when set to negative', () => {
    incrementUnread('/todos')
    setUnreadCount('/todos', -1)
    expect(getUnreadCounts()['/todos']).toBeUndefined()
  })

  it('notifies listeners', () => {
    const listener = vi.fn()
    subscribeUnreadCounts(listener)
    setUnreadCount('/pipeline', 3)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('getUnreadCounts', () => {
  it('returns empty object initially', () => {
    expect(getUnreadCounts()).toEqual({})
  })

  it('returns current snapshot after mutations', () => {
    incrementUnread('/messages', 3)
    incrementUnread('/missions', 1)
    expect(getUnreadCounts()).toEqual({
      '/messages': 3,
      '/missions': 1,
    })
  })
})

describe('subscribeUnreadCounts', () => {
  it('returns an unsubscribe function', () => {
    const listener = vi.fn()
    const unsub = subscribeUnreadCounts(listener)
    expect(typeof unsub).toBe('function')

    incrementUnread('/messages')
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    incrementUnread('/messages')
    expect(listener).toHaveBeenCalledTimes(1) // no new call
  })
})
