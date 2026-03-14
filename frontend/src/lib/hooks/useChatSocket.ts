import { useEffect, useRef, useCallback, useState } from 'react'
import { API_BASE } from '@/lib/api'

/** API key getter — mirrors what api.ts uses internally */
let _apiKey: string | undefined
export function setChatSocketApiKey(key: string) { _apiKey = key }

export interface WsMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  images?: string[]
}

interface UseChatSocketOptions {
  /** Called for each new message received over WebSocket */
  onMessage: (msg: WsMessage) => void
  /** Called when connection status changes */
  onStatusChange?: (connected: boolean) => void
  /** Whether the socket should be active (default: true) */
  enabled?: boolean
}

interface UseChatSocketReturn {
  /** Whether the WebSocket is currently connected */
  connected: boolean
  /** Whether we fell back to polling (WS failed) */
  usingFallback: boolean
}

const WS_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000] as const
const MAX_RECONNECT_ATTEMPTS = 10

/**
 * Hook that maintains a WebSocket connection to /api/chat/ws for real-time
 * message delivery. Falls back gracefully if the connection cannot be
 * established or drops permanently.
 */
export function useChatSocket(opts: UseChatSocketOptions): UseChatSocketReturn {
  const { onMessage, onStatusChange, enabled = true } = opts
  const [connected, setConnected] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)

  // Store callbacks in refs so reconnect logic always uses latest
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  const wsRef = useRef<WebSocket | null>(null)
  const attemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const updateStatus = useCallback((status: boolean) => {
    setConnected(status)
    onStatusChangeRef.current?.(status)
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return

    const wsBase = API_BASE.replace(/^http/, 'ws')
    const params = _apiKey ? `?apiKey=${encodeURIComponent(_apiKey)}` : ''
    const url = `${wsBase}/api/chat/ws${params}`

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      // WebSocket constructor can throw in some environments
      setUsingFallback(true)
      updateStatus(false)
      return
    }

    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      attemptRef.current = 0
      setUsingFallback(false)
      updateStatus(true)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg: WsMessage = JSON.parse(event.data)
        if (msg.id && msg.role && msg.text !== undefined) {
          onMessageRef.current(msg)
        }
      } catch {
        // Ignore non-JSON frames (pings, etc.)
      }
    }

    ws.onerror = () => {
      // onerror is always followed by onclose; reconnection happens there
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      wsRef.current = null
      updateStatus(false)

      attemptRef.current += 1
      if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        // Give up — signal fallback to polling
        setUsingFallback(true)
        return
      }

      const delayIdx = Math.min(attemptRef.current - 1, WS_RECONNECT_DELAYS.length - 1)
      const delay = WS_RECONNECT_DELAYS[delayIdx]
      reconnectTimerRef.current = setTimeout(connect, delay)
    }
  }, [updateStatus])

  useEffect(() => {
    mountedRef.current = true

    if (enabled) {
      connect()
    }

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect on unmount
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [enabled, connect])

  return { connected, usingFallback }
}
