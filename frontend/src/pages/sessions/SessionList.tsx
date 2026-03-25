import { ChatTeardrop } from '@phosphor-icons/react'
import { isDemoMode } from '@/lib/demo-data'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { GatewayStatusDot } from '@/components/GatewayStatusDot'
import { SessionCard } from './SessionCard'

interface SessionListProps {
  selectedId: string | null
  onSelect: (key: string) => void
}

export function SessionList({ selectedId, onSelect }: SessionListProps) {
  const demo = isDemoMode()
  const { sessions, available, isLoading } = useGatewaySessions()

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
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: '8px',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Sessions
        </span>
        <GatewayStatusDot size={7} />
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {/* Demo mode banner */}
        {demo && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'var(--blue-a08)',
              border: '1px solid var(--blue-a25)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--blue-solid)' }}>Sessions not configured</span>
            <br />
            Connect OpenClaw in Settings to manage Claude sessions.
          </div>
        )}

        {/* Unreachable banner */}
        {!demo && !available && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'var(--red-500)14',
              border: '1px solid var(--red-500)33',
              color: 'var(--red-500)',
              fontSize: '12px',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            OpenClaw is unreachable
          </div>
        )}

        {/* Loading state — skeleton cards */}
        {isLoading && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  background: 'var(--hover-bg)',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ height: '14px', width: '60%', borderRadius: '4px', background: 'var(--border)', animation: 'shimmer 1.5s ease-in-out infinite' }} />
                <div style={{ height: '12px', width: '40%', borderRadius: '4px', background: 'var(--border)', animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: '0.15s' }} />
                <div style={{ height: '12px', width: '50%', borderRadius: '4px', background: 'var(--border)', animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: '0.3s' }} />
              </div>
            ))}
          </>
        )}

        {/* Empty state */}
        {!isLoading && sessions.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '24px',
            color: 'var(--text-muted)',
          }}>
            <ChatTeardrop size={32} weight="thin" />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              No sessions yet
            </div>
            <div style={{ fontSize: '12px', textAlign: 'center' }}>
              Start a new chat to create your first session
            </div>
          </div>
        )}

        {/* Session cards */}
        {sessions.map((session) => (
          <SessionCard
            key={session.key as string}
            session={session}
            selected={session.key === selectedId}
            onSelect={() => onSelect(session.key as string)}
          />
        ))}
      </div>
    </div>
  )
}
