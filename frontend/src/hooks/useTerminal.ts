import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { ApiError, api, getRequestApiKeyForPath, getRequestBaseForPath } from '@/lib/api'
import { buildThemeFromCSS } from '@/lib/terminal-theme'

interface UseTerminalOptions {
  fontSize?: number
  initialCommand?: string
  cwd?: string
  processId?: string
  env?: Record<string, string | number | boolean | null | undefined>
}

interface UseTerminalReturn {
  connected: boolean
  error: string | null
  status: 'checking' | 'connecting' | 'connected' | 'running' | 'stopped' | 'closed' | 'error'
  processId: string | null
  cwd: string | null
  exitCode: number | null
  exitSignal: number | null
  closeReason: string | null
  stop: () => void
  restart: () => void
}

function newTerminalProcessId() {
  return `chat-terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeTerminalEnv(env?: Record<string, string | number | boolean | null | undefined>): Record<string, string> {
  if (!env) return {}
  return Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key.trim(), value])
      .filter(([key, value]) => Boolean(key) && value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  )
}

export function buildTerminalWebSocketUrl(
  cwd?: string,
  processId?: string,
  env?: Record<string, string | number | boolean | null | undefined>,
) {
  const path = '/api/terminal/ws'
  const wsBase = getRequestBaseForPath(path).replace(/^http/, 'ws')
  const params = new URLSearchParams()
  const apiKey = getRequestApiKeyForPath(path)
  if (apiKey) params.set('apiKey', apiKey)
  const trimmedCwd = cwd?.trim()
  const trimmedProcessId = processId?.trim()
  const terminalEnv = normalizeTerminalEnv(env)
  if (trimmedCwd) params.set('cwd', trimmedCwd)
  if (trimmedProcessId) params.set('processId', trimmedProcessId)
  if (Object.keys(terminalEnv).length > 0) params.set('env', JSON.stringify(terminalEnv))
  const query = params.toString()
  return `${wsBase}${path}${query ? `?${query}` : ''}`
}

function terminalStatusCheckErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'Terminal requires authentication. Sign in or refresh the local API key, then retry.'
    }
    if (error.status === 404) {
      return 'Terminal route is unavailable on this backend. Update or restart the ClawControl backend, then retry.'
    }
    if (error.status === 0) {
      return `Terminal backend is unreachable at ${getRequestBaseForPath('/api/terminal/status')}. Start or reconnect the ClawControl backend, then retry.`
    }
    return `Terminal backend failed its startup check (API ${error.status}). Restart the backend, then retry.`
  }
  return 'Terminal backend status check failed. Restart the backend, then retry.'
}

function terminalBackendErrorMessage(error: string, code?: string): string {
  switch (code) {
    case 'pty_open_failed':
    case 'pty_spawn_failed':
    case 'pty_reader_failed':
    case 'pty_writer_failed':
      return `Terminal backend could not start a PTY session: ${error}`
    default:
      return `Terminal backend reported: ${error}`
  }
}

function terminalCloseErrorMessage(event: CloseEvent): string {
  if (event.code === 1008) {
    return 'Terminal websocket was rejected by backend policy. Check sign-in and permissions, then retry.'
  }
  if (event.code === 1011) {
    return 'Terminal backend hit an internal error while opening the PTY route. Restart the backend, then retry.'
  }
  return 'Terminal backend did not accept the websocket. Check that the backend is running and you are signed in.'
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseTerminalOptions = {}
): UseTerminalReturn {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<UseTerminalReturn['status']>('connecting')
  const [processIdState, setProcessIdState] = useState<string | null>(null)
  const [cwdState, setCwdState] = useState<string | null>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [exitSignal, setExitSignal] = useState<number | null>(null)
  const [closeReason, setCloseReason] = useState<string | null>(null)
  const [restartToken, setRestartToken] = useState(0)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mountedRef = useRef(true)
  const stoppedByUserRef = useRef(false)
  const fontSize = options.fontSize ?? 13
  const initialCommand = options.initialCommand?.trim()
  const cwd = options.cwd?.trim()
  const configuredProcessId = options.processId?.trim()
  const envSignature = JSON.stringify(normalizeTerminalEnv(options.env))

  const stop = useCallback(() => {
    stoppedByUserRef.current = true
    setConnected(false)
    setStatus('stopped')
    setError(null)
    termRef.current?.write('\r\n[terminal stopped]\r\n')
    const ws = wsRef.current
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminate', processId: processIdState }))
      }
      ws.close(1000, 'Stopped by user')
    }
  }, [processIdState])

  const restart = useCallback(() => {
    stoppedByUserRef.current = false
    setConnected(false)
    setError(null)
    setStatus('connecting')
    setExitCode(null)
    setExitSignal(null)
    setCloseReason(null)
    setRestartToken(value => value + 1)
  }, [])

  // --- Terminal creation + WebSocket + resize ---
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    mountedRef.current = true
    stoppedByUserRef.current = false
    setConnected(false)
    setError(null)
    setStatus('checking')
    setProcessIdState(null)
    setCwdState(cwd || null)
    setExitCode(null)
    setExitSignal(null)
    setCloseReason(null)

    // Local variables for cleanup (captured by closure, work with async setup)
    let term: Terminal | null = null
    let ws: WebSocket | null = null
    let fitAddon: FitAddon | null = null
    let resizeObserver: ResizeObserver | null = null
    let themeObserver: MutationObserver | null = null
    let onDataDisposable: { dispose(): void } | null = null
    let onBinaryDisposable: { dispose(): void } | null = null
    let onResizeDisposable: { dispose(): void } | null = null

    const setup = async () => {
      // Pre-flight: check terminal capacity before creating anything
      let capacityOk = true
      try {
        const status = await api.get<{ active: number; max: number; available: number }>('/api/terminal/status')
        if (status.available <= 0) {
          setError(`Too many terminal sessions (max ${status.max})`)
          setStatus('error')
          capacityOk = false
        }
      } catch (error) {
        setError(terminalStatusCheckErrorMessage(error))
        setStatus('error')
        capacityOk = false
      }
      if (!capacityOk || !mountedRef.current) return
      setStatus('connecting')

      // Create terminal
      fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()

      term = new Terminal({
        cursorStyle: 'bar',
        cursorBlink: true,
        fontSize,
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        scrollback: 1000,
        theme: buildThemeFromCSS(),
        allowProposedApi: true,
      })

      term.loadAddon(fitAddon)
      term.loadAddon(webLinksAddon)
      term.open(container)

      termRef.current = term
      fitAddonRef.current = fitAddon

      // Initial fit after browser computes layout
      requestAnimationFrame(() => {
        if (!mountedRef.current) return
        fitAddon?.fit()
      })

      // --- Copy/paste via Ctrl+Shift+C/V ---
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyC' && event.type === 'keydown') {
          const selection = term?.getSelection()
          if (selection) {
            navigator.clipboard.writeText(selection)
            return false
          }
        }
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyV' && event.type === 'keydown') {
          navigator.clipboard.readText().then(text => {
            term?.paste(text)
          })
          return false
        }
        return true
      })

      // --- WebSocket connection (connect AFTER term.open + fit) ---
      const processId = configuredProcessId || newTerminalProcessId()
      setProcessIdState(processId)
      const terminalEnv = JSON.parse(envSignature) as Record<string, string>
      ws = new WebSocket(buildTerminalWebSocketUrl(cwd, processId, terminalEnv))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      // Track whether onopen fired for onclose error detection
      let didOpen = false

      ws.onopen = () => {
        if (!mountedRef.current) { ws?.close(); return }
        didOpen = true
        setConnected(true)
        setStatus('connected')
        setError(null)
        // Send initial size
        const dims = fitAddon?.proposeDimensions()
        if (dims && ws) {
          ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
        }
        if (initialCommand && ws) {
          ws.send(JSON.stringify({ type: 'input', data: `${initialCommand}\n` }))
        }
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        if (event.data instanceof ArrayBuffer) {
          term?.write(new Uint8Array(event.data))
        } else if (typeof event.data === 'string') {
          // Text frame -- could be error JSON from backend
          try {
            const msg = JSON.parse(event.data)
            if (msg.error) {
              setError(terminalBackendErrorMessage(String(msg.error), typeof msg.code === 'string' ? msg.code : undefined))
              setStatus('error')
              return
            }
            if (msg.type === 'started') {
              setProcessIdState(typeof msg.processId === 'string' ? msg.processId : processId)
              setCwdState(typeof msg.cwd === 'string' ? msg.cwd : (cwd || null))
              setStatus('running')
              return
            }
            if (msg.type === 'closed' || msg.type === 'exited') {
              setExitCode(typeof msg.exitCode === 'number' ? msg.exitCode : null)
              setExitSignal(typeof msg.exitSignal === 'number' ? msg.exitSignal : null)
              setCloseReason(typeof msg.reason === 'string' ? msg.reason : null)
              setStatus('closed')
              return
            }
          } catch {
            // Not JSON -- write as plain text
          }
          term?.write(event.data)
        }
      }

      ws.onerror = () => {
        // onerror is always followed by onclose
      }

      ws.onclose = (event) => {
        if (!mountedRef.current) return
        setConnected(false)
        if (stoppedByUserRef.current) {
          setStatus('stopped')
          return
        }
        // If WebSocket closed without ever connecting (code 1006 = abnormal),
        // show a generic error so the user isn't stuck on "Connecting..."
        if (!didOpen && event.code === 1006) {
          setError(terminalCloseErrorMessage(event))
          setStatus('error')
          return
        }
        if (!didOpen && (event.code === 1008 || event.code === 1011)) {
          setError(terminalCloseErrorMessage(event))
          setStatus('error')
          return
        }
        setStatus(didOpen ? 'closed' : 'error')
      }

      // --- User input -> WebSocket ---
      const localTerm = term
      onDataDisposable = localTerm.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }))
        }
      })

      onBinaryDisposable = localTerm.onBinary((data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }))
        }
      })

      // --- Resize: ResizeObserver + notify backend ---
      onResizeDisposable = localTerm.onResize(({ cols, rows }) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      })

      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (!mountedRef.current || !fitAddonRef.current) return
          fitAddonRef.current.fit()
        })
      })
      resizeObserver.observe(container)

      // --- Theme sync: MutationObserver on data-theme attribute ---
      themeObserver = new MutationObserver(() => {
        if (termRef.current) {
          termRef.current.options.theme = buildThemeFromCSS()
        }
      })
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'style'],
      })
    }

    setup()

    // --- Cleanup ---
    return () => {
      mountedRef.current = false
      themeObserver?.disconnect()
      resizeObserver?.disconnect()
      onDataDisposable?.dispose()
      onBinaryDisposable?.dispose()
      onResizeDisposable?.dispose()
      if (ws) {
        ws.onclose = null // prevent state updates after unmount
        ws.close()
      }
      wsRef.current = null
      term?.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [containerRef, initialCommand, cwd, configuredProcessId, envSignature, restartToken])

  // --- Font size update (runtime config change) ---
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize
      fitAddonRef.current?.fit()
    }
  }, [fontSize])

  return {
    connected,
    error,
    status,
    processId: processIdState,
    cwd: cwdState,
    exitCode,
    exitSignal,
    closeReason,
    stop,
    restart,
  }
}
