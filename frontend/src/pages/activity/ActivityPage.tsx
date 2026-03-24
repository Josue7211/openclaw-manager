import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Stop, Clock, Shield, Warning, Pulse } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

// ── Types ────────────────────────────────────────────────────────────────────

interface ActivityEvent {
  id?: string
  type: string
  description?: string
  message?: string
  timestamp?: string
  created_at?: string
  session_id?: string
  agent?: string
  [key: string]: unknown
}

interface ActivityResponse {
  ok: boolean
  data?: {
    events?: ActivityEvent[]
    [key: string]: unknown
  } | ActivityEvent[]
}

// ── Icon mapping ─────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  'session.start': { icon: Play, color: 'var(--green-500)' },
  'session.started': { icon: Play, color: 'var(--green-500)' },
  'session.stop': { icon: Stop, color: 'var(--red-500)' },
  'session.stopped': { icon: Stop, color: 'var(--red-500)' },
  'session.complete': { icon: Stop, color: 'var(--text-muted)' },
  'cron.run': { icon: Clock, color: 'var(--blue)' },
  'cron.complete': { icon: Clock, color: 'var(--blue)' },
  'approval': { icon: Shield, color: 'var(--amber)' },
  'approval.granted': { icon: Shield, color: 'var(--green-500)' },
  'approval.denied': { icon: Shield, color: 'var(--red-500)' },
  'error': { icon: Warning, color: 'var(--red-500)' },
}

function getEventIcon(type: string): { icon: React.ElementType; color: string } {
  if (EVENT_ICONS[type]) return EVENT_ICONS[type]
  if (type.startsWith('session')) return { icon: Play, color: 'var(--accent)' }
  if (type.startsWith('cron')) return { icon: Clock, color: 'var(--blue)' }
  if (type.startsWith('error')) return { icon: Warning, color: 'var(--red-500)' }
  if (type.startsWith('approval')) return { icon: Shield, color: 'var(--amber)' }
  return { icon: Pulse, color: 'var(--text-muted)' }
}

// ── Relative time ────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { data, isLoading, error } = useQuery<ActivityResponse>({
    queryKey: queryKeys.gatewayActivity,
    queryFn: () => api.get<ActivityResponse>('/api/gateway/activity'),
    refetchInterval: 5_000,
    staleTime: 5_000,
  })

  const events = useMemo<ActivityEvent[]>(() => {
    if (!data) return []
    // Handle both { data: { events: [...] } } and { data: [...] }
    if (Array.isArray(data.data)) return data.data
    if (data.data && Array.isArray(data.data.events)) return data.data.events
    return []
  }, [data])

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--hover-bg)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Pulse size={20} weight="bold" style={{ color: 'var(--accent)' }} />
          <h1 style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Activity
          </h1>
          {events.length > 0 && (
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'var(--accent)',
              color: 'var(--text-on-accent)',
              fontWeight: 600,
            }}>
              {events.length}
            </span>
          )}
        </div>
        <p style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          margin: '4px 0 0',
        }}>
          Real-time event feed from the gateway
        </p>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 24px',
      }}>
        {isLoading && events.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</span>
          </div>
        )}

        {error && !data && (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Unable to load activity. Check gateway connection.
            </span>
          </div>
        )}

        {!isLoading && !error && events.length === 0 && (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Pulse size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
              No recent activity
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Events will appear here when agents run sessions, crons execute, or approvals are requested.
            </p>
          </div>
        )}

        {events.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {events.map((event, i) => (
              <EventCard key={event.id ?? `event-${i}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: ActivityEvent }) {
  const { icon: Icon, color } = getEventIcon(event.type)
  const timestamp = event.timestamp || event.created_at || ''
  const description = event.description || event.message || event.type

  return (
    <div
      className="hover-bg"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '10px',
        transition: 'background 0.15s',
      }}
    >
      {/* Timeline dot + icon */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        background: 'var(--bg-white-03)',
        border: '1px solid var(--hover-bg-bright)',
        flexShrink: 0,
      }}>
        <Icon size={16} weight="bold" style={{ color }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {description}
          </span>
          {timestamp && (
            <span style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
              flexShrink: 0,
            }}>
              {relativeTime(timestamp)}
            </span>
          )}
        </div>

        {/* Context pills */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
          {/* Event type pill */}
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '4px',
            background: 'var(--bg-white-03)',
            color: 'var(--text-muted)',
            fontWeight: 500,
            border: '1px solid var(--hover-bg)',
          }}>
            {event.type}
          </span>

          {/* Agent pill */}
          {event.agent && (
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'var(--bg-white-03)',
              color: 'var(--text-muted)',
              fontWeight: 500,
              border: '1px solid var(--hover-bg)',
            }}>
              {String(event.agent)}
            </span>
          )}

          {/* Session ID pill */}
          {event.session_id && (
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'var(--bg-white-03)',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
              border: '1px solid var(--hover-bg)',
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {String(event.session_id).slice(0, 8)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
