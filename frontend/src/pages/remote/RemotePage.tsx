import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import RFB from '@novnc/novnc'
import {
  ArrowsClockwise,
  ArrowsOut,
  ClipboardText,
  Desktop,
  Plugs,
  PlugsConnected,
  Wrench,
} from '@phosphor-icons/react'
import { ApiError, api, getApiBase, getLocalApiKey } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { PageHeader } from '@/components/PageHeader'
import { buildRemoteViewerWsUrl } from '@/lib/remote-viewer'
import type { RemoteViewerRepairResult, RemoteViewerStatus } from '@/lib/remote-viewer'

type ViewerState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

function repairErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body
    const text = typeof body === 'string'
      ? body
      : body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : error.message

    try {
      const parsed = JSON.parse(text) as { message?: string, steps?: Array<{ target?: string, error?: string }> }
      const failedStep = parsed.steps?.find(step => step.error)
      if (failedStep?.error) return `${parsed.message || 'Repair failed'}: ${failedStep.error}`
      if (parsed.message) return parsed.message
    } catch {
      // Keep the original API error text below.
    }
    return text
  }
  return error instanceof Error ? error.message : 'Repair failed'
}

export default function RemotePage() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rfbRef = useRef<RFB | null>(null)
  const autoRepairKeyRef = useRef<string | null>(null)
  const [viewerState, setViewerState] = useState<ViewerState>('idle')
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [clipboardText, setClipboardText] = useState('')
  const [connectNonce, setConnectNonce] = useState(0)
  const [repairing, setRepairing] = useState(false)
  const [repairMessage, setRepairMessage] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: queryKeys.vncStatus,
    queryFn: () => api.get<RemoteViewerStatus>('/api/vnc/status'),
    refetchInterval: 10_000,
  })

  const reachable = data?.reachable ?? false
  const canConnect = (data?.available ?? reachable) && !isLoading
  const isBlocked = data?.available === false

  const statusLabel = useMemo(() => {
    if (isLoading) return 'Checking'
    if (!reachable) return data?.message ?? 'Offline'
    if (data?.available === false) return data.message
    if (viewerState === 'connected') return 'Connected'
    if (viewerState === 'connecting') return 'Connecting'
    if (viewerState === 'error') return 'Error'
    return 'Ready'
  }, [data?.available, data?.message, isLoading, reachable, viewerState])

  useEffect(() => {
    if (!canConnect || !containerRef.current) return

    let connected = false
    let timedOut = false
    const stateTimerId = window.setTimeout(() => {
      if (!connected) {
        setViewerState('connecting')
        setViewerError(null)
      }
    }, 0)

    let rfb: RFB
    try {
      rfb = new RFB(containerRef.current, buildRemoteViewerWsUrl(getApiBase(), getLocalApiKey()), {
        shared: true,
      })
    } catch (error) {
      window.clearTimeout(stateTimerId)
      const errorMessage = error instanceof Error ? error.message : 'Viewer failed to start'
      const errorTimerId = window.setTimeout(() => {
        setViewerState('error')
        setViewerError(errorMessage)
      }, 0)
      return () => window.clearTimeout(errorTimerId)
    }

    rfb.scaleViewport = true
    rfb.resizeSession = false
    rfb.qualityLevel = 6
    rfb.compressionLevel = 2
    rfb.showDotCursor = true
    rfb.background = '#050506'

    const timeoutId = window.setTimeout(() => {
      if (connected) return
      timedOut = true
      setViewerState('error')
      setViewerError('Viewer connection timed out')
      rfb.disconnect()
    }, 20_000)

    const onConnect = () => {
      connected = true
      window.clearTimeout(stateTimerId)
      window.clearTimeout(timeoutId)
      setViewerState('connected')
      setViewerError(null)
    }

    const onDisconnect = (event: Event) => {
      window.clearTimeout(stateTimerId)
      window.clearTimeout(timeoutId)
      if (timedOut) {
        setViewerState('error')
        setViewerError('Viewer connection timed out')
        return
      }
      const detail = (event as CustomEvent<{ clean?: boolean }>).detail
      setViewerState(detail?.clean ? 'disconnected' : 'error')
      if (!detail?.clean) setViewerError('Viewer connection dropped')
    }

    const onSecurityFailure = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail
      window.clearTimeout(stateTimerId)
      window.clearTimeout(timeoutId)
      setViewerState('error')
      setViewerError(detail?.reason || 'VNC security handshake failed')
    }

    const onCredentialsRequired = () => {
      window.clearTimeout(stateTimerId)
      window.clearTimeout(timeoutId)
      setViewerState('error')
      setViewerError('VNC credentials required')
    }

    rfb.addEventListener('connect', onConnect)
    rfb.addEventListener('disconnect', onDisconnect)
    rfb.addEventListener('securityfailure', onSecurityFailure)
    rfb.addEventListener('credentialsrequired', onCredentialsRequired)
    rfbRef.current = rfb

    return () => {
      window.clearTimeout(stateTimerId)
      window.clearTimeout(timeoutId)
      rfb.removeEventListener('connect', onConnect)
      rfb.removeEventListener('disconnect', onDisconnect)
      rfb.removeEventListener('securityfailure', onSecurityFailure)
      rfb.removeEventListener('credentialsrequired', onCredentialsRequired)
      rfb.disconnect()
      rfbRef.current = null
    }
  }, [canConnect, connectNonce])

  const reconnect = () => {
    setViewerState('connecting')
    setViewerError(null)
    setRepairMessage(null)
    void refetch()
    setConnectNonce(value => value + 1)
  }

  const repairViewer = useCallback(async (mode: 'manual' | 'auto' = 'manual') => {
    setRepairing(true)
    setRepairMessage(mode === 'auto' ? 'Repairing viewer connection' : null)
    try {
      await api.post<RemoteViewerRepairResult>('/api/vnc/repair', { target: 'all' })
      setRepairMessage('Repair complete')
      await refetch()
      setConnectNonce(value => value + 1)
    } catch (error) {
      setViewerState('error')
      setViewerError(repairErrorMessage(error))
      setRepairMessage('Repair failed')
      void refetch()
    } finally {
      setRepairing(false)
    }
  }, [refetch])

  useEffect(() => {
    if (isLoading || reachable || repairing || !data?.guidance?.repairHost) return
    const reason = `${data.reason || ''} ${data.message || ''}`.toLowerCase()
    if (!reason.includes('refused') && !reason.includes('timed out') && !reason.includes('not reachable')) return

    const repairKey = data.target?.address || data.host || 'default'
    if (autoRepairKeyRef.current === repairKey) return
    autoRepairKeyRef.current = repairKey
    void repairViewer('auto')
  }, [data, isLoading, reachable, repairViewer, repairing])

  const fullscreen = () => {
    void containerRef.current?.parentElement?.requestFullscreen?.()
  }

  const sendClipboard = () => {
    if (clipboardText.trim()) {
      rfbRef.current?.clipboardPasteFrom(clipboardText)
    }
  }

  const dotColor = viewerState === 'connected'
    ? 'var(--green-500)'
    : reachable
      ? 'var(--amber)'
      : 'var(--red-500)'

  return (
    <div style={{ height: '100%', minHeight: 'calc(100vh - 72px)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader defaultTitle="Remote Viewer" defaultSubtitle="Harness VM desktop" />

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-bg)',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 170,
          color: 'var(--text-secondary)',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {viewerState === 'connected' ? <PlugsConnected size={16} /> : <Plugs size={16} />}
          <span style={{ width: 8, height: 8, borderRadius: 99, background: dotColor }} />
          {statusLabel}
        </div>

        <button type="button" onClick={reconnect} disabled={!reachable || isBlocked} className="icon-button" aria-label="Reconnect viewer">
          <ArrowsClockwise size={16} />
        </button>
        <button type="button" onClick={fullscreen} disabled={!reachable} className="icon-button" aria-label="Fullscreen viewer">
          <ArrowsOut size={16} />
        </button>
        <button type="button" onClick={() => repairViewer()} disabled={repairing} className="icon-button" aria-label="Repair viewer">
          <Wrench size={16} />
        </button>

        <div style={{ flex: 1 }} />

        <input
          aria-label="Remote clipboard text"
          value={clipboardText}
          onChange={event => setClipboardText(event.target.value)}
          placeholder="Clipboard"
          style={{
            width: 220,
            maxWidth: '28vw',
            height: 30,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--input-bg)',
            color: 'var(--text-primary)',
            padding: '0 9px',
            fontSize: 12,
          }}
        />
        <button type="button" onClick={sendClipboard} disabled={viewerState !== 'connected'} className="icon-button" aria-label="Send clipboard">
          <ClipboardText size={16} />
        </button>
      </div>

      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        background: '#050506',
        overflow: 'hidden',
      }}>
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />

        {(!reachable || isBlocked || viewerState === 'connecting' || viewerState === 'error') && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-secondary)',
            background: '#050506',
          }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
              <Desktop size={40} weight="duotone" />
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {viewerState === 'connecting' ? 'Connecting' : viewerError || data?.message || 'Viewer offline'}
              </div>
              {viewerState !== 'connecting' && data?.reason && (
                <div style={{ maxWidth: 520, color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>
                  {data.reason}
                </div>
              )}
              {repairMessage && (
                <div style={{ maxWidth: 520, color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>
                  {repairMessage}
                </div>
              )}
              {reachable && data && (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                  {data.active}/{data.max} sessions
                </div>
              )}
              {(!reachable || viewerState === 'error') && (
                <button type="button" onClick={() => repairViewer()} disabled={repairing} className="icon-button" aria-label="Repair viewer">
                  <Wrench size={16} />
                </button>
              )}
              {((reachable && !isBlocked) || viewerState === 'connecting') && (
                <button type="button" onClick={reconnect} className="icon-button" aria-label="Reconnect viewer">
                  <ArrowsClockwise size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
