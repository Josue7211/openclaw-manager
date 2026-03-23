import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { API_BASE } from '@/lib/api'
import { buildThemeFromCSS } from '@/lib/terminal-theme'

interface UseTerminalOptions {
  fontSize?: number
}

interface UseTerminalReturn {
  connected: boolean
  error: string | null
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseTerminalOptions = {}
): UseTerminalReturn {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mountedRef = useRef(true)
  const fontSize = options.fontSize ?? 13

  // --- Terminal creation + WebSocket + resize ---
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    mountedRef.current = true

    // Create terminal
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    const term = new Terminal({
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
      fitAddon.fit()
    })

    // --- Copy/paste via Ctrl+Shift+C/V ---
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC' && event.type === 'keydown') {
        const selection = term.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection)
          return false
        }
      }
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyV' && event.type === 'keydown') {
        navigator.clipboard.readText().then(text => {
          term.paste(text)
        })
        return false
      }
      return true
    })

    // --- WebSocket connection (connect AFTER term.open + fit) ---
    const wsBase = API_BASE.replace(/^http/, 'ws')
    const ws = new WebSocket(`${wsBase}/api/terminal/ws`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      setConnected(true)
      setError(null)
      // Send initial size
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
      }
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data))
      } else if (typeof event.data === 'string') {
        // Text frame -- could be error JSON from backend
        try {
          const msg = JSON.parse(event.data)
          if (msg.error) {
            setError(msg.error)
            return
          }
        } catch {
          // Not JSON -- write as plain text
        }
        term.write(event.data)
      }
    }

    ws.onerror = () => {
      // onerror is always followed by onclose
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
    }

    // --- User input -> WebSocket ---
    const onDataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    const onBinaryDisposable = term.onBinary((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // --- Resize: ResizeObserver + notify backend ---
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!mountedRef.current || !fitAddonRef.current) return
        fitAddonRef.current.fit()
      })
    })
    resizeObserver.observe(container)

    // --- Theme sync: MutationObserver on data-theme attribute ---
    const themeObserver = new MutationObserver(() => {
      if (termRef.current) {
        termRef.current.options.theme = buildThemeFromCSS()
      }
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    })

    // --- Cleanup ---
    return () => {
      mountedRef.current = false
      themeObserver.disconnect()
      resizeObserver.disconnect()
      onDataDisposable.dispose()
      onBinaryDisposable.dispose()
      onResizeDisposable.dispose()
      ws.onclose = null // prevent state updates after unmount
      ws.close()
      wsRef.current = null
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, []) // Empty deps -- create once per mount

  // --- Font size update (runtime config change) ---
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize
      fitAddonRef.current?.fit()
    }
  }, [fontSize])

  return { connected, error }
}
