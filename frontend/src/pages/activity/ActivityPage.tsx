import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Lightning, Robot, Timer, Warning, ArrowRight } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { SkeletonRows } from '@/components/Skeleton'
import { PageHeader } from '@/components/PageHeader'
import { useRealtimeSSE } from '@/lib/hooks/useRealtimeSSE'

// -- Types -------------------------------------------------------------------

export interface ActivityEvent {
  id: string
  type: string
  description?: string
  message?: string
  timestamp?: string
  created_at?: string
  session_id?: string
  agent?: string
}

interface ActivityResponse {
  ok: boolean
  data?: { events?: ActivityEvent[] } | ActivityEvent[]
}

// -- Helpers -----------------------------------------------------------------

/** Normalise the gateway response into an array of events. */
function extractEvents(data: ActivityResponse | undefined): ActivityEvent[] {
  if (!data?.data) return []
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.data.events)) return data.data.events
  return []
}

/** Map event type to an icon component. */
function iconForType(type: string) {
  if (type.startsWith('session')) return ArrowRight
  if (type.startsWith('agent')) return Robot
  if (type.startsWith('cron')) return Timer
  if (type === 'error') return Warning
  return Lightning
}

/** Map event type to a CSS variable colour. */
function colorForType(type: string): string {
  if (type.startsWith('session')) return 'var(--accent)'
  if (type.startsWith('agent')) return 'var(--purple)'
  if (type.startsWith('cron')) return 'var(--blue)'
  if (type === 'error') return 'var(--red-500)'
  return 'var(--text-muted)'
}

/** Relative time string from ISO timestamp. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0 || diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

// -- Component ---------------------------------------------------------------

export default function ActivityPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery<ActivityResponse>({
    queryKey: queryKeys.gatewayActivity,
    queryFn: () => api.get<ActivityResponse>('/api/gateway/activity'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  // SSE: invalidate activity query on any table change related to gateway data.
  // We subscribe to the 'agents' table events since those map to gateway activity.
  useRealtimeSSE(['agents'], {
    queryKeys: { agents: queryKeys.gatewayActivity },
  })

  // Also poll-invalidate when the tab becomes visible (complements refetchOnWindowFocus)
  const visibilityRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: queryKeys.gatewayActivity })
      }
    }
    visibilityRef.current = handler
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [queryClient])

  const events = extractEvents(data)

  return (
    <div style={{ padding: '20px 28px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader defaultTitle="Activity" defaultSubtitle="live feed of gateway events" />

      <div style={{ flex: 1, overflowY: 'auto', marginTop: '16px' }}>
        {isLoading ? (
          <SkeletonRows count={6} />
        ) : isError ? (
          <div
            role="alert"
            style={{
              padding: '24px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: '13px',
            }}
          >
            Unable to load activity
          </div>
        ) : events.length === 0 ? (
          <div style={{
            padding: '48px 24px', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic',
          }}>
            No recent activity
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {events.map((event) => {
              const Icon = iconForType(event.type)
              const color = colorForType(event.type)
              const ts = event.timestamp || event.created_at || ''
              const label = event.description || event.message || event.type

              return (
                <div
                  key={event.id}
                  className="hover-bg"
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    padding: '8px 10px', borderRadius: '8px',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Icon */}
                  <div style={{ flexShrink: 0, marginTop: '2px' }}>
                    <Icon size={16} weight="bold" style={{ color }} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Type pill */}
                      <span style={{
                        fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                        borderRadius: '6px', background: `color-mix(in srgb, ${color} 15%, transparent)`,
                        color, whiteSpace: 'nowrap',
                      }}>
                        {event.type}
                      </span>
                      {/* Description */}
                      <span style={{
                        fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1,
                      }}>
                        {label}
                      </span>
                      {/* Timestamp */}
                      {ts && (
                        <span style={{
                          fontSize: '10px', color: 'var(--text-muted)',
                          fontFamily: 'monospace', flexShrink: 0,
                        }}>
                          {relativeTime(ts)}
                        </span>
                      )}
                    </div>
                    {/* Extra metadata */}
                    {(event.agent || event.session_id) && (
                      <div style={{
                        fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px',
                        display: 'flex', gap: '8px',
                      }}>
                        {event.agent && <span>agent: {event.agent}</span>}
                        {event.session_id && <span>session: {event.session_id}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
