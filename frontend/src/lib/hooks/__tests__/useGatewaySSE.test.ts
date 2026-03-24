import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock EventSource with named event listener support
class MockEventSource {
  static instances: MockEventSource[] = []
  readyState = 1 // OPEN
  onerror: (() => void) | null = null
  url: string
  private listeners = new Map<string, Set<(event: Event) => void>>()

  constructor(url: string) {
    this.url = url
    this.readyState = 1
    MockEventSource.instances.push(this)
  }

  close() {
    this.readyState = 2 // CLOSED
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  /** Simulate a named SSE event (event: <name>, data: <json>) */
  simulateNamedEvent(eventName: string, data: string) {
    const handlers = this.listeners.get(eventName)
    if (handlers) {
      const event = new MessageEvent(eventName, { data })
      handlers.forEach(h => h(event))
    }
  }
}
Object.assign(MockEventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 })

// Mock React Query
const { invalidateQueriesMock } = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))

// Mock API_BASE and getApiKey
vi.mock('@/lib/api', () => ({
  API_BASE: 'http://127.0.0.1:3000',
  getApiKey: () => 'test-key',
}))

// Mock event-bus emit
const { emitMock } = vi.hoisted(() => ({
  emitMock: vi.fn(),
}))

vi.mock('@/lib/event-bus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-bus')>()
  return {
    ...actual,
    emit: emitMock,
  }
})

// Helper: import a fresh copy of the hook after resetting modules.
// This is necessary because useGatewaySSE uses a module-level singleton.
async function freshImport() {
  vi.resetModules()
  return import('../useGatewaySSE')
}

describe('useGatewaySSE', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    invalidateQueriesMock.mockClear()
    emitMock.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('creates an EventSource connection to /api/gateway/events', async () => {
    const { useGatewaySSE } = await freshImport()
    renderHook(() => useGatewaySSE())

    expect(MockEventSource.instances.length).toBeGreaterThan(0)
    expect(MockEventSource.instances[0].url).toContain('/api/gateway/events')
  })

  it('includes API key in URL query param', async () => {
    const { useGatewaySSE } = await freshImport()
    renderHook(() => useGatewaySSE())

    expect(MockEventSource.instances[0].url).toContain('api_key=test-key')
  })

  it('gateway events are dispatched to registered listeners by event name', async () => {
    const { useGatewaySSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() => useGatewaySSE({ events: ['agent'], onEvent }))

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateNamedEvent('agent', JSON.stringify({ id: 'a1', status: 'active' }))
    })

    expect(onEvent).toHaveBeenCalledWith('agent', { id: 'a1', status: 'active' })
  })

  it('dispatches events to event-bus via emit()', async () => {
    const { useGatewaySSE } = await freshImport()
    renderHook(() => useGatewaySSE({ events: ['chat'] }))

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateNamedEvent('chat', JSON.stringify({ message: 'hello' }))
    })

    expect(emitMock).toHaveBeenCalledWith('gateway-chat', { message: 'hello' }, 'gateway')
  })

  it('invalidates query keys when matching events fire', async () => {
    const { useGatewaySSE } = await freshImport()
    renderHook(() =>
      useGatewaySSE({
        events: ['agent'],
        queryKeys: { agent: ['agents'] },
      }),
    )

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateNamedEvent('agent', JSON.stringify({ id: 'a1' }))
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['agents'] })
  })

  it('cleans up EventSource on unmount when refCount hits 0', async () => {
    const { useGatewaySSE } = await freshImport()
    const { unmount } = renderHook(() => useGatewaySSE())

    const es = MockEventSource.instances[0]
    expect(es.readyState).toBe(1) // OPEN

    unmount()
    // Advance timer past the 1000ms cleanup delay
    act(() => {
      vi.advanceTimersByTime(1100)
    })

    expect(es.readyState).toBe(2) // CLOSED
  })

  it('multiple hook instances share the same EventSource (singleton)', async () => {
    const { useGatewaySSE } = await freshImport()
    renderHook(() => useGatewaySSE())
    renderHook(() => useGatewaySSE())

    // Only one EventSource should be created
    expect(MockEventSource.instances.length).toBe(1)
  })

  it('does not close EventSource when one of multiple consumers unmounts', async () => {
    const { useGatewaySSE } = await freshImport()
    const { unmount: unmount1 } = renderHook(() => useGatewaySSE())
    renderHook(() => useGatewaySSE())

    const es = MockEventSource.instances[0]

    unmount1()
    act(() => {
      vi.advanceTimersByTime(1100)
    })

    // Should still be open because second consumer is active
    expect(es.readyState).toBe(1)
  })

  it('handles events for multiple event names', async () => {
    const { useGatewaySSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() => useGatewaySSE({ events: ['agent', 'cron'], onEvent }))

    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateNamedEvent('agent', JSON.stringify({ id: 'a1' }))
      es.simulateNamedEvent('cron', JSON.stringify({ job: 'backup' }))
    })

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent).toHaveBeenCalledWith('agent', { id: 'a1' })
    expect(onEvent).toHaveBeenCalledWith('cron', { job: 'backup' })
  })

  it('ignores malformed JSON data without throwing', async () => {
    const { useGatewaySSE } = await freshImport()
    const onEvent = vi.fn()
    renderHook(() => useGatewaySSE({ events: ['agent'], onEvent }))

    const es = MockEventSource.instances[0]
    // Should not throw despite invalid JSON
    act(() => {
      es.simulateNamedEvent('agent', 'not-valid-json')
    })

    expect(onEvent).not.toHaveBeenCalled()
    expect(emitMock).not.toHaveBeenCalled()
  })
})
