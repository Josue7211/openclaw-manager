import { useCallback, useEffect, useRef, useState } from 'react'
import RFB from '@novnc/novnc/lib/rfb'
import { API_BASE, api } from '@/lib/api'
import type { VncOptions, UseVncReturn } from '@/pages/remote/types'

export function useVnc(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: VncOptions = {}
): UseVncReturn {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rfbRef = useRef<InstanceType<typeof RFB> | null>(null)
  const mountedRef = useRef(true)
  const passwordRef = useRef<string>('')

  const createConnection = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    // Disconnect existing
    if (rfbRef.current) {
      rfbRef.current.disconnect()
      rfbRef.current = null
    }

    setError(null)
    setConnected(false)

    try {
      // Fetch VNC credentials from backend
      const { password } = await api.get<{ password: string }>('/api/vnc/credentials')
      passwordRef.current = password

      // Build WebSocket URL
      const wsBase = API_BASE.replace(/^http/, 'ws')
      const wsUrl = `${wsBase}/api/vnc/ws`

      // Create RFB instance
      const rfb = new RFB(container, wsUrl, {
        credentials: { password, username: '', target: '' },
      })

      // Configure display behavior
      rfb.scaleViewport = true
      rfb.resizeSession = false
      rfb.clipViewport = false
      rfb.focusOnClick = true
      rfb.qualityLevel = options.quality ?? 6
      rfb.compressionLevel = options.compression ?? 2
      rfb.viewOnly = options.viewOnly ?? false

      // Event listeners
      rfb.addEventListener('connect', () => {
        if (!mountedRef.current) return
        setConnected(true)
        setError(null)
      })

      rfb.addEventListener('disconnect', (e) => {
        if (!mountedRef.current) return
        setConnected(false)
        if (!e.detail.clean) {
          setError('VNC connection lost')
        }
      })

      rfb.addEventListener('credentialsrequired', () => {
        rfb.sendCredentials({
          password: passwordRef.current,
          username: '',
          target: '',
        })
      })

      rfb.addEventListener('clipboard', (e) => {
        navigator.clipboard.writeText(e.detail.text).catch(() => {
          // Clipboard write may fail if document is not focused
        })
      })

      rfbRef.current = rfb
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to connect')
      }
    }
  }, [containerRef, options.quality, options.compression, options.viewOnly])

  // Main effect: create connection on mount
  useEffect(() => {
    mountedRef.current = true

    const container = containerRef.current
    if (!container) return

    createConnection()

    return () => {
      mountedRef.current = false
      rfbRef.current?.disconnect()
      rfbRef.current = null
    }
  }, []) // Empty deps -- create once per mount

  const disconnect = useCallback(() => {
    rfbRef.current?.disconnect()
  }, [])

  const reconnect = useCallback(() => {
    createConnection()
  }, [createConnection])

  const sendClipboard = useCallback((text: string) => {
    rfbRef.current?.clipboardPasteFrom(text)
  }, [])

  return { connected, error, disconnect, reconnect, sendClipboard }
}
