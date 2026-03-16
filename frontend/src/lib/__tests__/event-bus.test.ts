import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let emit: typeof import('../event-bus').emit
let subscribe: typeof import('../event-bus').subscribe

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('../event-bus')
  emit = mod.emit
  subscribe = mod.subscribe
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('emit', () => {
  it('does not throw when no listeners are registered', () => {
    expect(() => emit('new-message')).not.toThrow()
  })

  it('delivers event to subscribed handler', () => {
    const handler = vi.fn()
    subscribe('new-message', handler)

    emit('new-message', { id: 42 }, 'sse')

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0]
    expect(event.type).toBe('new-message')
    expect(event.data).toEqual({ id: 42 })
    expect(event.source).toBe('sse')
    expect(typeof event.timestamp).toBe('number')
  })

  it('delivers to multiple handlers for the same event type', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    subscribe('todo-changed', h1)
    subscribe('todo-changed', h2)

    emit('todo-changed')

    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('does not deliver to handlers of a different event type', () => {
    const handler = vi.fn()
    subscribe('mission-updated', handler)

    emit('new-message')

    expect(handler).not.toHaveBeenCalled()
  })

  it('catches and logs handler errors without affecting other handlers', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()
    subscribe('settings-changed', bad)
    subscribe('settings-changed', good)

    emit('settings-changed')

    expect(good).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toContain('settings-changed')
  })

  it('sets data to undefined when not provided', () => {
    const handler = vi.fn()
    subscribe('connection-status', handler)

    emit('connection-status')

    expect(handler.mock.calls[0][0].data).toBeUndefined()
  })

  it('sets source to undefined when not provided', () => {
    const handler = vi.fn()
    subscribe('message-read', handler)

    emit('message-read', { guid: 'x' })

    expect(handler.mock.calls[0][0].source).toBeUndefined()
  })

  it('uses Date.now() for timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00Z'))

    const handler = vi.fn()
    subscribe('new-message', handler)

    emit('new-message')

    expect(handler.mock.calls[0][0].timestamp).toBe(new Date('2026-03-15T10:00:00Z').getTime())

    vi.useRealTimers()
  })
})

describe('subscribe', () => {
  it('returns an unsubscribe function', () => {
    const handler = vi.fn()
    const unsub = subscribe('new-message', handler)

    expect(typeof unsub).toBe('function')
  })

  it('unsubscribe prevents future deliveries', () => {
    const handler = vi.fn()
    const unsub = subscribe('new-message', handler)

    emit('new-message')
    expect(handler).toHaveBeenCalledTimes(1)

    unsub()
    emit('new-message')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('unsubscribing one handler does not affect others', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    const unsub1 = subscribe('todo-changed', h1)
    subscribe('todo-changed', h2)

    unsub1()
    emit('todo-changed')

    expect(h1).not.toHaveBeenCalled()
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('supports subscribing the same handler to different event types', () => {
    const handler = vi.fn()
    subscribe('new-message', handler)
    subscribe('mission-updated', handler)

    emit('new-message')
    emit('mission-updated')

    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler.mock.calls[0][0].type).toBe('new-message')
    expect(handler.mock.calls[1][0].type).toBe('mission-updated')
  })

  it('double unsubscribe is safe', () => {
    const handler = vi.fn()
    const unsub = subscribe('new-message', handler)

    unsub()
    expect(() => unsub()).not.toThrow()
  })
})
