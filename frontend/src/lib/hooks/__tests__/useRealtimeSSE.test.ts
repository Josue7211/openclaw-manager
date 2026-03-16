import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock EventSource — defined at module scope so vi.stubGlobal can reference it
class MockEventSource {
  static instances: MockEventSource[] = []
  readyState = 1 // OPEN
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  url: string

  constructor(url: string) {
    this.url = url
    this.readyState = 1
    MockEventSource.instances.push(this)
  }

  close() {
    this.readyState = 2 // CLOSED
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror()
    }
  }
}
// Static constants matching the EventSource spec
Object.assign(MockEventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 })

// Mock React Query
const { invalidateQueriesMock } = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))

// Mock API_BASE
vi.mock('@/lib/api', () => ({
  API_BASE: 'http://127.0.0.1:3000',
}))

// Helper: import a fresh copy of the hook after resetting modules.
// This is necessary because useRealtimeSSE uses a module-level singleton
// (eventSource, refCount, tableListeners) that must be reset between tests.
async function freshImport() {
  vi.resetModules()
  return import('../useRealtimeSSE')
}

describe('useRealtimeSSE', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    invalidateQueriesMock.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('module exports useRealtimeSSE and useTableRealtime', async () => {
    const mod = await freshImport()
    expect(typeof mod.useRealtimeSSE).toBe('function')
    expect(typeof mod.useTableRealtime).toBe('function')
  })

  it('creates an EventSource connection to /api/events', async () => {
    const { useRealtimeSSE } = await freshImport()
    renderHook(() => useRealtimeSSE(['todos'], {}))

    expect(MockEventSource.instances.length).toBeGreaterThan(0)
    expect(MockEventSource.instances[0].url).toBe('http://127.0.0.1:3000/api/events')
  })

  it('invalidates query key when a matching table event arrives', async () => {
    const { useRealtimeSSE } = await freshImport()
    renderHook(() =>
      useRealtimeSSE(['todos'], {
        queryKeys: { todos: ['todos'] },
      }),
    )

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage(JSON.stringify({ table: 'todos', event: 'INSERT' }))
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['todos'] })
  })

  it('calls onEvent callback with the table name when an event fires', async () => {
    const { useRealtimeSSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() => useRealtimeSSE(['agents'], { onEvent }))

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage(JSON.stringify({ table: 'agents', event: 'UPDATE' }))
    })

    expect(onEvent).toHaveBeenCalledWith('agents')
  })

  it('calls both queryKey invalidation and onEvent when both provided', async () => {
    const { useRealtimeSSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() =>
      useRealtimeSSE(['missions'], {
        queryKeys: { missions: ['missions'] },
        onEvent,
      }),
    )

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage(JSON.stringify({ table: 'missions', event: 'DELETE' }))
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['missions'] })
    expect(onEvent).toHaveBeenCalledWith('missions')
  })

  it('does not fire listeners for unsubscribed tables', async () => {
    const { useRealtimeSSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() => useRealtimeSSE(['todos'], { onEvent }))

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage(JSON.stringify({ table: 'agents', event: 'INSERT' }))
    })

    expect(onEvent).not.toHaveBeenCalled()
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  it('ignores malformed SSE messages without throwing', async () => {
    const { useRealtimeSSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() => useRealtimeSSE(['todos'], { onEvent }))

    const es = MockEventSource.instances[0]
    // Should not throw despite invalid JSON
    act(() => {
      es.simulateMessage('not-valid-json')
    })

    expect(onEvent).not.toHaveBeenCalled()
  })

  it('handles multiple tables in a single subscription', async () => {
    const { useRealtimeSSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() =>
      useRealtimeSSE(['todos', 'agents'], {
        queryKeys: { todos: ['todos'], agents: ['agents'] },
        onEvent,
      }),
    )

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage(JSON.stringify({ table: 'todos', event: 'INSERT' }))
      es.simulateMessage(JSON.stringify({ table: 'agents', event: 'UPDATE' }))
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['agents'] })
    expect(onEvent).toHaveBeenCalledTimes(2)
  })

  it('does not invalidate queries when only onEvent is provided', async () => {
    const { useRealtimeSSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() => useRealtimeSSE(['cache'], { onEvent }))

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage(JSON.stringify({ table: 'cache', event: 'INSERT' }))
    })

    expect(invalidateQueriesMock).not.toHaveBeenCalled()
    expect(onEvent).toHaveBeenCalledWith('cache')
  })
})

describe('useTableRealtime', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    invalidateQueriesMock.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('invalidates the query key on table event', async () => {
    const { useTableRealtime } = await freshImport()
    renderHook(() =>
      useTableRealtime('todos', { queryKey: ['todos'] }),
    )

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage(JSON.stringify({ table: 'todos', event: 'INSERT' }))
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['todos'] })
  })

  it('calls onEvent callback on table event', async () => {
    const { useTableRealtime } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() => useTableRealtime('agents', { onEvent }))

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage(JSON.stringify({ table: 'agents', event: 'UPDATE' }))
    })

    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('works with no options provided', async () => {
    const { useTableRealtime } = await freshImport()
    expect(() => {
      renderHook(() => useTableRealtime('todos'))
    }).not.toThrow()
  })
})
