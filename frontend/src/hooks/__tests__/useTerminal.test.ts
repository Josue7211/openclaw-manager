import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mock classes (module scope, before vi.mock) ──────────────────────

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

  close(_code?: number, _reason?: string) {
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

  private dataCallbacks: Array<(data: string) => void> = []
  private binaryCallbacks: Array<(data: string) => void> = []
  private resizeCallbacks: Array<(size: { cols: number; rows: number }) => void> = []

  constructor(_opts?: Record<string, unknown>) {
    MockTerminal.instances.push(this)
    if (_opts) {
      Object.assign(this.options, _opts)
    }
  }

  onData(cb: (data: string) => void) {
    this.dataCallbacks.push(cb)
    return { dispose: vi.fn() }
  }

  onBinary(cb: (data: string) => void) {
    this.binaryCallbacks.push(cb)
    return { dispose: vi.fn() }
  }

  onResize(cb: (size: { cols: number; rows: number }) => void) {
    this.resizeCallbacks.push(cb)
    return { dispose: vi.fn() }
  }

  // Test helpers
  fireData(data: string) {
    this.dataCallbacks.forEach(cb => cb(data))
  }

  fireResize(cols: number, rows: number) {
    this.resizeCallbacks.forEach(cb => cb({ cols, rows }))
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
    // store callback if needed
  }
}

class MockMutationObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn().mockReturnValue([])
  constructor(_cb: MutationCallback) {
    // store callback if needed
  }
}

class MockApiError extends Error {
  name = 'ApiError'

  constructor(public status: number, public body: unknown) {
    super(typeof body === 'string' ? body : `API ${status}`)
  }
}

// ── vi.mock calls ────────────────────────────────────────────────────

vi.mock('@xterm/xterm', () => ({ Terminal: MockTerminal }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: MockFitAddon }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: vi.fn() }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@/lib/api', () => ({
  API_BASE: 'http://127.0.0.1:5000',
  ApiError: MockApiError,
  getRequestBaseForPath: vi.fn(() => 'http://127.0.0.1:5000'),
  getRequestApiKeyForPath: vi.fn(() => 'terminal-key'),
  api: {
    get: vi.fn().mockResolvedValue({ active: 0, max: 5, available: 5 }),
  },
}))
vi.mock('@/lib/terminal-theme', () => ({
  buildThemeFromCSS: vi.fn().mockReturnValue({ background: '#000' }),
}))

// ── Helpers ──────────────────────────────────────────────────────────

const flushPromises = () => new Promise(r => setTimeout(r, 0))

function createContainerRef(): React.RefObject<HTMLDivElement | null> {
  return { current: document.createElement('div') }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('useTerminal', () => {
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
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))

    // Wait for async setup (capacity check + WS creation)
    await act(async () => { await flushPromises() })

    expect(MockWebSocket.instances.length).toBe(1)

    // Simulate WS open
    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })

    expect(result.current.connected).toBe(true)
    expect(result.current.status).toBe('connected')
    expect(result.current.error).toBeNull()
  })

  it('writes ArrayBuffer data to terminal on binary message', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    const buffer = new ArrayBuffer(4)
    const view = new Uint8Array(buffer)
    view.set([72, 101, 108, 108]) // "Hell"

    act(() => { ws.simulateMessage(buffer) })

    const term = MockTerminal.instances[0]
    expect(term.write).toHaveBeenCalledWith(new Uint8Array(buffer))
  })

  it('writes string data to terminal on text message', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    act(() => { ws.simulateMessage('hello world') })

    const term = MockTerminal.instances[0]
    expect(term.write).toHaveBeenCalledWith('hello world')
  })

  it('sets error when JSON error envelope received via WS message', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    act(() => {
      ws.simulateMessage(JSON.stringify({ error: 'PTY spawn failed' }))
    })

    expect(result.current.error).toBe('Terminal backend reported: PTY spawn failed')
    expect(result.current.status).toBe('error')
  })

  it('adds PTY startup context when a coded backend error envelope is received', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'error',
        code: 'pty_spawn_failed',
        error: 'No such file or directory',
      }))
    })

    expect(result.current.error).toBe('Terminal backend could not start a PTY session: No such file or directory')
    expect(result.current.status).toBe('error')
  })

  it('sets connected=false on WebSocket close', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })
    expect(result.current.connected).toBe(true)

    act(() => { ws.simulateClose(1000) })
    expect(result.current.connected).toBe(false)
    expect(result.current.status).toBe('closed')
  })

  it('sets a backend/auth error on close with code 1006 before open', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    // Close with 1006 WITHOUT ever calling simulateOpen
    act(() => { ws.simulateClose(1006) })

    expect(result.current.error).toBe('Terminal backend did not accept the websocket. Check that the backend is running and you are signed in.')
    expect(result.current.connected).toBe(false)
    expect(result.current.status).toBe('error')
  })

  it('sets an auth-specific error when the terminal status preflight is unauthorized', async () => {
    const { api, ApiError } = await import('@/lib/api')
    ;(api.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(401, { error: 'Authentication required' }),
    )
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    expect(result.current.error).toBe('Terminal requires authentication. Sign in or refresh the local API key, then retry.')
    expect(result.current.status).toBe('error')
    expect(MockWebSocket.instances.length).toBe(0)
  })

  it('sets a route-specific error when the terminal route is missing', async () => {
    const { api, ApiError } = await import('@/lib/api')
    ;(api.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(404, { error: 'not found' }),
    )
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    expect(result.current.error).toBe('Terminal route is unavailable on this backend. Update or restart the ClawControl backend, then retry.')
    expect(result.current.status).toBe('error')
    expect(MockWebSocket.instances.length).toBe(0)
  })

  it('sends JSON {type:"input", data} to WS when terminal onData fires', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    const term = MockTerminal.instances[0]
    act(() => { term.fireData('ls -la\r') })

    expect(ws.sentMessages).toContainEqual(
      JSON.stringify({ type: 'input', data: 'ls -la\r' })
    )
  })

  it('sends JSON {type:"resize", cols, rows} to WS when terminal onResize fires', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    // Clear initial messages (resize sent on open)
    ws.sentMessages = []

    const term = MockTerminal.instances[0]
    act(() => { term.fireResize(120, 40) })

    expect(ws.sentMessages).toContainEqual(
      JSON.stringify({ type: 'resize', cols: 120, rows: 40 })
    )
  })

  it('sends initial resize dimensions on WS open', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    // proposeDimensions returns { cols: 80, rows: 24 }
    expect(ws.sentMessages).toContainEqual(
      JSON.stringify({ type: 'resize', cols: 80, rows: 24 })
    )
  })

  it('sends initial command after the terminal opens', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    renderHook(() => useTerminal(containerRef, { initialCommand: 'npm run dev' }))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    expect(ws.sentMessages).toContainEqual(
      JSON.stringify({ type: 'input', data: 'npm run dev\n' })
    )
  })

  it('passes cwd and processId as websocket query data', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    renderHook(() => useTerminal(containerRef, {
      cwd: '/Volumes/T7/projects/clawcontrol',
      processId: 'chat-proc-1',
    }))
    await act(async () => { await flushPromises() })

    expect(MockWebSocket.instances[0].url).toBe(
      'ws://127.0.0.1:5000/api/terminal/ws?apiKey=terminal-key&cwd=%2FVolumes%2FT7%2Fprojects%2Fclawcontrol&processId=chat-proc-1',
    )
  })

  it('passes structured terminal environment as websocket query data', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    renderHook(() => useTerminal(containerRef, {
      cwd: '/Volumes/T7/projects/clawcontrol',
      processId: 'chat-proc-1',
      env: {
        CLAWCONTROL_PROJECT_PATH: '/Volumes/T7/projects/clawcontrol',
        CLAWCONTROL_BRANCH: 'codex/terminal-env',
        CLAWCONTROL_RUNTIME: 'Work locally',
        EMPTY_VALUE: null,
      },
    }))
    await act(async () => { await flushPromises() })

    const url = new URL(MockWebSocket.instances[0].url)
    expect(url.searchParams.get('apiKey')).toBe('terminal-key')
    expect(url.searchParams.get('cwd')).toBe('/Volumes/T7/projects/clawcontrol')
    expect(url.searchParams.get('processId')).toBe('chat-proc-1')
    expect(JSON.parse(url.searchParams.get('env') || '{}')).toEqual({
      CLAWCONTROL_PROJECT_PATH: '/Volumes/T7/projects/clawcontrol',
      CLAWCONTROL_BRANCH: 'codex/terminal-env',
      CLAWCONTROL_RUNTIME: 'Work locally',
    })
  })

  it('tracks lifecycle messages without writing them into the terminal buffer', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef, {
      cwd: '/Volumes/T7/projects/clawcontrol',
      processId: 'chat-proc-1',
    }))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'started',
        processId: 'chat-proc-1',
        cwd: '/Volumes/T7/projects/clawcontrol',
      }))
    })

    expect(result.current.status).toBe('running')
    expect(result.current.processId).toBe('chat-proc-1')
    expect(result.current.cwd).toBe('/Volumes/T7/projects/clawcontrol')
    expect(MockTerminal.instances[0].write).not.toHaveBeenCalledWith(expect.stringContaining('started'))

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'closed',
        processId: 'chat-proc-1',
        reason: 'terminated',
        exitCode: null,
        exitSignal: null,
      }))
    })

    expect(result.current.status).toBe('closed')
    expect(result.current.closeReason).toBe('terminated')
    expect(result.current.exitCode).toBeNull()
    expect(result.current.exitSignal).toBeNull()
  })

  it('stops the PTY websocket and marks the terminal stopped', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    act(() => { result.current.stop() })

    const terminateMessage = ws.sentMessages.map((message) => JSON.parse(message) as { type?: string; processId?: string })
      .find((message) => message.type === 'terminate')
    expect(terminateMessage?.processId).toMatch(/^chat-terminal-/)
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
    expect(result.current.connected).toBe(false)
    expect(result.current.status).toBe('stopped')
    expect(MockTerminal.instances[0].write).toHaveBeenCalledWith('\r\n[terminal stopped]\r\n')
  })

  it('restarts the terminal session and reruns the initial command', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef, { initialCommand: 'npm run test' }))
    await act(async () => { await flushPromises() })

    const firstWs = MockWebSocket.instances[0]
    act(() => { firstWs.simulateOpen() })

    act(() => { result.current.restart() })
    await act(async () => { await flushPromises() })

    expect(firstWs.readyState).toBe(MockWebSocket.CLOSED)
    expect(MockWebSocket.instances.length).toBe(2)

    const secondWs = MockWebSocket.instances[1]
    act(() => { secondWs.simulateOpen() })

    expect(secondWs.sentMessages).toContainEqual(
      JSON.stringify({ type: 'input', data: 'npm run test\n' })
    )
    expect(result.current.status).toBe('connected')
  })

  it('sets error when capacity check returns available=0', async () => {
    const { api } = await import('@/lib/api')
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      active: 5, max: 5, available: 0,
    })

    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    expect(result.current.error).toBe('Too many terminal sessions (max 5)')
    expect(result.current.status).toBe('error')
    // No WebSocket should be created
    expect(MockWebSocket.instances.length).toBe(0)
  })

  it('disposes terminal and closes WS on unmount', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { unmount } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })

    const term = MockTerminal.instances[0]

    act(() => { unmount() })

    expect(term.dispose).toHaveBeenCalled()
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
  })

  it('does not update state after unmount (mountedRef guard)', async () => {
    const { useTerminal } = await import('../useTerminal')
    const containerRef = createContainerRef()

    const { result, unmount } = renderHook(() => useTerminal(containerRef))
    await act(async () => { await flushPromises() })

    const ws = MockWebSocket.instances[0]
    act(() => { ws.simulateOpen() })
    expect(result.current.connected).toBe(true)

    // Unmount clears mountedRef and nullifies onclose
    act(() => { unmount() })

    // After unmount, simulate a message — should not throw or update state
    // ws.onclose was set to null in cleanup, so simulateClose won't fire
    // ws.onmessage might still be set, but mountedRef check prevents updates
    // This primarily verifies no errors are thrown
    expect(() => {
      ws.simulateMessage('late data')
    }).not.toThrow()
  })
})
