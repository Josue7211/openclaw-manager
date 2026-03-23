import { useEffect, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { API_BASE } from '@/lib/api'
import { buildThemeFromCSS } from '@/lib/terminal-theme'

interface UseSessionOutputReturn {
  connected: boolean
  error: string | null
}

export function useSessionOutput(
  containerRef: React.RefObject<HTMLDivElement | null>,
  sessionId: string | null,
  options?: { fontSize?: number }
): UseSessionOutputReturn {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fontSize = options?.fontSize ?? 13

  useEffect(() => {
    const container = containerRef.current
    if (!container || !sessionId) return

    let mounted = true
    let term: Terminal | null = null
    let ws: WebSocket | null = null
    let fitAddon: FitAddon | null = null
    let resizeObserver: ResizeObserver | null = null
    let themeObserver: MutationObserver | null = null

    // Create terminal (read-only)
    fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term = new Terminal({
      cursorStyle: 'bar',
      cursorBlink: false,
      fontSize,
      fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      scrollback: 5000,
      theme: buildThemeFromCSS(),
      allowProposedApi: true,
      disableStdin: true,
    })

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(container)

    // Copy-only via Ctrl+Shift+C (no paste -- read-only)
    const localTerm = term
    localTerm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC' && event.type === 'keydown') {
        const selection = localTerm.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection)
          return false
        }
      }
      return true
    })

    // Initial fit after layout computation
    requestAnimationFrame(() => {
      if (!mounted) return
      fitAddon?.fit()
    })

    // WebSocket for session output stream
    const wsBase = API_BASE.replace(/^http/, 'ws')
    ws = new WebSocket(`${wsBase}/api/claude-sessions/${sessionId}/ws`)
    let didOpen = false

    ws.onopen = () => {
      if (!mounted) { ws?.close(); return }
      didOpen = true
      setConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      if (!mounted) return
      if (typeof event.data === 'string') {
        // Check for JSON error envelope from backend
        try {
          const msg = JSON.parse(event.data)
          if (msg.error) {
            setError(msg.error)
            return
          }
        } catch {
          // Not JSON -- write as plain text output
        }
        localTerm.write(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        localTerm.write(new Uint8Array(event.data))
      }
    }

    ws.onclose = (event) => {
      if (!mounted) return
      setConnected(false)
      if (!didOpen && event.code === 1006) {
        setError('Session output connection failed')
      }
    }

    // ResizeObserver for container fitting (no resize protocol sent to WS)
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!mounted || !fitAddon) return
        fitAddon.fit()
      })
    })
    resizeObserver.observe(container)

    // Theme sync via MutationObserver
    themeObserver = new MutationObserver(() => {
      if (localTerm) localTerm.options.theme = buildThemeFromCSS()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    })

    return () => {
      mounted = false
      themeObserver?.disconnect()
      resizeObserver?.disconnect()
      if (ws) { ws.onclose = null; ws.close() }
      localTerm.dispose()
    }
  }, [sessionId, fontSize]) // Re-run when sessionId or fontSize changes

  return { connected, error }
}
