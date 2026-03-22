import React from 'react'
import { CalendarDots, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useCalendarWidget } from '@/lib/hooks/dashboard/useCalendarWidget'
import type { WidgetProps } from '@/lib/widget-registry'
import type { CalendarEvent } from '@/lib/types'

export const CalendarWidget = React.memo(function CalendarWidget(_props: WidgetProps) {
  const { todayEvents, upcomingEvents, mounted } = useCalendarWidget()
  const navigate = useNavigate()

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  const hasToday = todayEvents.length > 0
  const displayEvents = hasToday ? todayEvents : upcomingEvents

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <CalendarDots size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          {hasToday ? 'Today' : 'Upcoming'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {todayLabel}
        </span>
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
          {displayEvents.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No events scheduled
            </div>
          ) : (
            displayEvents.map((event: CalendarEvent) => (
              <div
                key={event.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '8px', transition: 'background 0.15s',
                }}
                className="hover-bg"
              >
                <span style={{
                  fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace',
                  flexShrink: 0, minWidth: '58px',
                }}>
                  {event.allDay ? 'All day' : formatTime12h(event.start)}
                </span>
                <span style={{
                  fontSize: '12px', color: 'var(--text-primary)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {event.title}
                </span>
                {!hasToday && (
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0,
                    fontFamily: 'monospace',
                  }}>
                    {formatShortDate(event.start)}
                  </span>
                )}
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/calendar')}
            aria-label="View full calendar"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto',
              paddingTop: '8px', fontSize: '11px', color: 'var(--accent)',
              background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            }}
          >
            View all <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
})

function formatTime12h(isoStr: string): string {
  try {
    const date = new Date(isoStr)
    if (isNaN(date.getTime())) return ''
    const h = date.getHours()
    const m = date.getMinutes()
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  } catch {
    return ''
  }
}

function formatShortDate(isoStr: string): string {
  const dateStr = isoStr.slice(0, 10)
  const [, month, day] = dateStr.split('-')
  return `${month}/${day}`
}
