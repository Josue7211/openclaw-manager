import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mock classes (self-contained — vitest runs files in isolation) ───

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  binaryType = 'blob'
  readyState = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose({ code: 1000 })
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) this.onopen(new Event('open'))
  }

  simulateMessage(data: string | ArrayBuffer) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  simulateClose(code: number) {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose({ code })
  }
}

class MockTerminal {
  static instances: MockTerminal[] = []

  open = vi.fn()
  write = vi.fn()
  dispose = vi.fn()
  loadAddon = vi.fn()
  paste = vi.fn()
  getSelection = vi.fn().mockReturnValue('')
  attachCustomKeyEventHandler = vi.fn()

  options: Record<string, unknown> = { fontSize: 13, theme: {} }
  constructorOpts: Record<string, unknown> = {}

  constructor(opts?: Record<string, unknown>) {
    MockTerminal.instances.push(this)
    if (opts) {
      this.constructorOpts = { ...opts }
      Object.assign(this.options, opts)
    }
  }

  onData(cb: (data: string) => void) {
    void cb
    return { dispose: vi.fn() }
  }

  onBinary(cb: (data: string) => void) {
    void cb
    return { dispose: vi.fn() }
  }

  onResize(cb: (size: { cols: number; rows: number }) => void) {
    void cb
    return { dispose: vi.fn() }
  }
}

class MockFitAddon {
  fit = vi.fn()
  proposeDimensions = vi.fn().mockReturnValue({ cols: 80, rows: 24 })
}

class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  constructor(_cb: ResizeObserverCallback) {
    // no-op
  }
}

class MockMutationObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn().mockReturnValue([])
  constructor(_cb: MutationCallback) {
    // no-op
  }
}

// ── vi.mock calls ────────────────────────────────────────────────────

vi.mock('@xterm/xterm', () => ({ Terminal: MockTerminal }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: MockFitAddon }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: vi.fn() }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@/lib/api', () => ({
  API_BASE: 'http://127.0.0.1:3000',
}))
vi.mock('@/lib/terminal-theme', () => ({
  buildThemeFromCSS: vi.fn().mockReturnValue({ background: '#000' }),
}))

// ── Helpers ──────────────────────────────────────────────────────────

function createContainerRef(): React.RefObject<HTMLDivElement | null> {
  return { current: document.createElement('div') }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('useSessionOutput', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    MockTerminal.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal('MutationObserver', MockMutationObserver)
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sets connected=true when WebSocket opens', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useSessionOutput(containerRef, 'session-1'))

    expect(MockWebSocket.instances.length).toBe(1)

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })

    expect(result.current.connected).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('writes string data to terminal on text message', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    renderHook(() => useSessionOutput(containerRef, 'session-1'))

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    act(() => { ws.simulateMessage('output line\n') })

    const term = MockTerminal.instances[0]
    expect(term.write).toHaveBeenCalledWith('output line\n')
  })

  it('writes ArrayBuffer data to terminal on binary message', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    renderHook(() => useSessionOutput(containerRef, 'session-1'))

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    const buffer = new ArrayBuffer(4)
    const view = new Uint8Array(buffer)
    view.set([72, 101, 108, 108])

    act(() => { ws.simulateMessage(buffer) })

    const term = MockTerminal.instances[0]
    expect(term.write).toHaveBeenCalledWith(new Uint8Array(buffer))
  })

  it('sets error when JSON error envelope received', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useSessionOutput(containerRef, 'session-1'))

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    act(() => {
      ws.simulateMessage(JSON.stringify({ error: 'Session not found' }))
    })

    expect(result.current.error).toBe('Session not found')
  })

  it('sets connected=false on WebSocket close', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useSessionOutput(containerRef, 'session-1'))

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })
    expect(result.current.connected).toBe(true)

    act(() => { ws.simulateClose(1000) })
    expect(result.current.connected).toBe(false)
  })

  it('sets error="Session output connection failed" on close with code 1006 before open', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useSessionOutput(containerRef, 'session-1'))

    const ws = MockWebSocket.instances[0]
    // Close with 1006 without ever opening
    act(() => { ws.simulateClose(1006) })

    expect(result.current.error).toBe('Session output connection failed')
    expect(result.current.connected).toBe(false)
  })

  it('does not create WebSocket when sessionId is null', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    renderHook(() => useSessionOutput(containerRef, null))

    expect(MockWebSocket.instances.length).toBe(0)
    // No terminal should be created either (container guard + sessionId guard)
    expect(MockTerminal.instances.length).toBe(0)
  })

  it('reconnects with new WebSocket when sessionId changes', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    const { rerender } = renderHook(
      ({ sessionId }) => useSessionOutput(containerRef, sessionId),
      { initialProps: { sessionId: 'session-1' as string | null } },
    )

    expect(MockWebSocket.instances.length).toBe(1)
    const ws1 = MockWebSocket.instances[0]
    act(() => { ws1.simulateOpen() })

    // Change sessionId
    rerender({ sessionId: 'session-2' })

    // First WS should have been closed (cleanup runs)
    expect(ws1.readyState).toBe(MockWebSocket.CLOSED)
    // New WS should be created
    expect(MockWebSocket.instances.length).toBe(2)
    expect(MockWebSocket.instances[1].url).toContain('session-2')
  })

  it('creates read-only terminal (disableStdin: true)', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    renderHook(() => useSessionOutput(containerRef, 'session-1'))

    const term = MockTerminal.instances[0]
    expect(term.constructorOpts).toHaveProperty('disableStdin', true)
  })

  it('disposes terminal and closes WS on unmount', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    const { unmount } = renderHook(() => useSessionOutput(containerRef, 'session-1'))

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    const term = MockTerminal.instances[0]

    act(() => { unmount() })

    expect(term.dispose).toHaveBeenCalled()
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
  })

  it('WebSocket URL includes sessionId in path', async () => {
    const { useSessionOutput } = await import('../useSessionOutput')
    const containerRef = createContainerRef()

    renderHook(() => useSessionOutput(containerRef, 'abc-123'))

    const ws = MockWebSocket.instances[0]
    expect(ws.url).toBe('ws://127.0.0.1:3000/api/claude-sessions/abc-123/ws')
  })
})
