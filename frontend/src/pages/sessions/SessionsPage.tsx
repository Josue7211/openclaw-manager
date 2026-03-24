import { useState, useCallback, useEffect, useMemo } from 'react'
import { Terminal, ClockCounterClockwise } from '@phosphor-icons/react'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { useGatewaySSE } from '@/lib/hooks/useGatewaySSE'
import { addNotification } from '@/components/NotificationCenter'
import { queryKeys } from '@/lib/query-keys'
import { SessionList } from './SessionList'
import { SessionOutputPanel } from './SessionOutputPanel'
import { SessionHistoryPanel } from './SessionHistoryPanel'
import { SessionControls } from './SessionControls'

type ViewMode = 'output' | 'history'

export default function SessionsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('history')
  const [listWidth, setListWidth] = useState(320)
  const { sessions, available } = useGatewaySessions()

  // Session lifecycle notifications via gateway SSE
  const handleSessionEvent = useCallback((eventName: string, payload: unknown) => {
    if (eventName !== 'chat') return
    const data = payload as Record<string, unknown> | null
    if (!data) return

    // Detect session completion or error from the event payload.
    // Gateway chat events include status/action fields -- handle defensively.
    const status = (data.status as string) ?? (data.action as string) ?? ''
    const sessionTask = (data.task as string) ?? (data.label as string) ?? 'Session'
    const agentName = (data.agentName as string) ?? (data.agent as string) ?? ''

    if (status === 'completed' || status === 'done') {
      addNotification(
        'system',
        'Session Completed',
        agentName ? `${agentName}: ${sessionTask}` : sessionTask,
        '/sessions',
      )
    } else if (status === 'error' || status === 'failed') {
      addNotification(
        'alert',
        'Session Error',
        agentName ? `${agentName}: ${sessionTask}` : sessionTask,
        '/sessions',
      )
    }
  }, [])

  useGatewaySSE({
    events: ['chat'],
    onEvent: handleSessionEvent,
    queryKeys: {
      chat: queryKeys.gatewayActivity,
    },
  })

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  )

  const showControls = selectedSession != null &&
    selectedSession.status === 'running'

  // Auto-set viewMode based on session status
  useEffect(() => {
    if (!selectedId) return
    const session = sessions.find((s) => s.id === selectedId)
    if (!session) return
    if (session.status === 'running') {
      setViewMode('output')
    } else {
      setViewMode('history')
    }
  }, [selectedId, sessions])

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = listWidth
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setListWidth(Math.max(240, Math.min(startWidth + delta, 480)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [listWidth])

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      margin: '-20px -28px',
      display: 'flex',
      overflow: 'hidden',
      userSelect: 'text',
      WebkitUserSelect: 'text',
    }}>
      {/* Left panel: session list */}
      <div style={{
        width: listWidth,
        minWidth: listWidth,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <SessionList selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResize}
        style={{
          width: 4,
          cursor: 'col-resize',
          background: 'transparent',
          flexShrink: 0,
          marginLeft: -2,
          marginRight: -2,
          zIndex: 10,
          position: 'relative',
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize session list"
      />

      {/* Right panel: tabbed view */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Tab bar */}
        {selectedId && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            padding: '0 12px',
            height: '40px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <TabButton
              active={viewMode === 'history'}
              onClick={() => setViewMode('history')}
              icon={<ClockCounterClockwise size={14} />}
              label="History"
            />
            <TabButton
              active={viewMode === 'output'}
              onClick={() => setViewMode('output')}
              icon={<Terminal size={14} />}
              label="Output"
            />
          </div>
        )}

        {/* Panel content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {viewMode === 'output' ? (
            <SessionOutputPanel sessionId={selectedId} key={`output-${selectedId}`} />
          ) : (
            <SessionHistoryPanel sessionId={selectedId} key={`history-${selectedId}`} />
          )}
        </div>

        {/* Session controls */}
        {showControls && selectedSession && (
          <SessionControls
            sessionId={selectedSession.id}
            available={available}
          />
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'var(--active-bg)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
      className={!active ? 'hover-bg' : undefined}
    >
      {icon}
      {label}
    </button>
  )
}
