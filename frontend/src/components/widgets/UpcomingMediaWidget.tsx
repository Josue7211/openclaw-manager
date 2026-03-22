import React from 'react'
import { FilmStrip, ArrowRight, CheckCircle } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useMediaWidget } from '@/lib/hooks/dashboard/useMediaWidget'
import type { WidgetProps } from '@/lib/widget-registry'

function formatRelativeDate(dateStr: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  const diffMs = target.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / 86400000)

  if (diffDays < 0) return 'Aired'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 7) return `in ${diffDays} days`
  if (diffDays <= 14) return 'in 2 weeks'
  return dateStr.slice(5) // MM-DD
}

function dateColor(dateStr: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)

  if (diffDays <= 0) return 'var(--green-500)'
  if (diffDays <= 1) return 'var(--accent)'
  if (diffDays <= 3) return 'var(--orange)'
  return 'var(--text-muted)'
}

export const UpcomingMediaWidget = React.memo(function UpcomingMediaWidget(_props: WidgetProps) {
  const { upcoming, mounted } = useMediaWidget()
  const navigate = useNavigate()

  const displayUpcoming = upcoming.slice(0, 5)

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <FilmStrip size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Upcoming
        </span>
        {mounted && upcoming.length > 0 && (
          <span style={{
            fontSize: '10px', fontWeight: 600, color: 'var(--accent)',
            background: 'var(--accent-a12)', padding: '2px 7px',
            borderRadius: '999px', fontFamily: 'monospace',
          }}>
            {upcoming.length}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0, overflowY: 'auto' }}>
          {displayUpcoming.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px', fontSize: '12px', color: 'var(--text-muted)',
            }}>
              <CheckCircle size={16} style={{ color: 'var(--green-500)' }} />
              <span>All caught up!</span>
            </div>
          ) : (
            displayUpcoming.map((item, i) => (
              <div
                key={`${item.title}-${i}`}
                className="hover-bg"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '8px', transition: 'background 0.15s',
                }}
              >
                <span style={{
                  fontSize: '12px', color: 'var(--text-primary)', flex: 1, fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 600, fontFamily: 'monospace',
                  color: dateColor(item.air_date), flexShrink: 0,
                }}>
                  {formatRelativeDate(item.air_date)}
                </span>
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/media')}
            aria-label="View all upcoming media"
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
