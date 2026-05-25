import { useState, useCallback, useMemo } from 'react'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { SessionList } from './SessionList'
import { SessionHistoryPanel } from './SessionHistoryPanel'

function sessionScopeKey(key: string | null, environmentId?: string | null): string | null {
  if (!key) return null
  const environment = environmentId?.trim()
  return environment ? `${environment}:${key}` : key
}

export default function SessionsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null)
  const [listWidth, setListWidth] = useState(320)
  const { sessions } = useGatewaySessions()

  const selectedSession = useMemo(
    () => sessions.find((s) => (
      sessionScopeKey(s.key, s.environmentId) === sessionScopeKey(selectedId, selectedEnvironmentId)
    )) ?? null,
    [sessions, selectedEnvironmentId, selectedId],
  )

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
      flex: 1,
      minHeight: 0,
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
        <SessionList
          selectedId={selectedId}
          selectedEnvironmentId={selectedEnvironmentId}
          onSelect={(key, environmentId) => {
            setSelectedId(key)
            setSelectedEnvironmentId(environmentId?.trim() || null)
          }}
          onDeleteSelected={(key, environmentId) => {
            if (sessionScopeKey(selectedId, selectedEnvironmentId) === sessionScopeKey(key, environmentId)) {
              setSelectedId(null)
              setSelectedEnvironmentId(null)
            }
          }}
        />
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

      {/* Right panel */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {selectedSession != null ? (
          <SessionHistoryPanel
            sessionId={selectedSession.key as string}
            environmentId={selectedSession.environmentId}
            key={`history-${sessionScopeKey(selectedSession.key as string, selectedSession.environmentId)}`}
          />
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}>
            Select a session to view its history
          </div>
        )}
      </div>
    </div>
  )
}
