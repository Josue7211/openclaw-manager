import { useRef } from 'react'
import { useSessionOutput } from '@/hooks/sessions/useSessionOutput'

interface SessionOutputPanelProps {
  sessionId: string | null
}

export function SessionOutputPanel({ sessionId }: SessionOutputPanelProps) {
  if (!sessionId) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}>
        Select a session to view output
      </div>
    )
  }

  return <SessionOutputView sessionId={sessionId} />
}

function SessionOutputView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { connected, error } = useSessionOutput(containerRef, sessionId)

  const shortId = sessionId.length > 12
    ? `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}`
    : sessionId

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: '13px',
          fontFamily: 'monospace',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}>
          {shortId}
        </span>

        <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connected ? 'var(--green-400)' : 'var(--amber)',
            animation: !connected ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontSize: '11px',
            color: connected ? 'var(--green-400)' : 'var(--amber)',
            fontWeight: 600,
          }}>
            {connected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            background: 'var(--red-500)14',
            color: 'var(--red-500)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {error}
        </div>
      )}

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="terminal-container"
        style={{
          flex: 1,
          padding: '4px',
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
