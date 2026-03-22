import React, { useMemo } from 'react'
import { Pulse, Target, Lightbulb, CheckCircle, Brain } from '@phosphor-icons/react'
import { SkeletonRows } from '@/components/Skeleton'
import { useActivityFeed } from '@/lib/hooks/dashboard/useActivityFeed'
import type { ActivityItem } from '@/lib/hooks/dashboard/useActivityFeed'
import type { WidgetProps } from '@/lib/widget-registry'

const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  Lightbulb,
  CheckCircle,
  Brain,
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return 'Earlier'
}

interface GroupedItems {
  label: string
  items: ActivityItem[]
}

function groupByDay(items: ActivityItem[]): GroupedItems[] {
  const groups: GroupedItems[] = []
  let currentLabel = ''

  for (const item of items) {
    const label = dayLabel(item.timestamp)
    if (label !== currentLabel) {
      currentLabel = label
      groups.push({ label, items: [] })
    }
    groups[groups.length - 1].items.push(item)
  }

  return groups
}

export const ActivityFeedWidget = React.memo(function ActivityFeedWidget({ config }: WidgetProps) {
  const maxItems = Number(config.maxItems ?? 15)
  const { feed, mounted } = useActivityFeed(maxItems)

  const groups = useMemo(() => groupByDay(feed), [feed])

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Pulse size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Activity
        </span>
        {mounted && feed.length > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            fontWeight: 600, lineHeight: 1,
          }}>
            {feed.length}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={4} />
      ) : feed.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
          No recent activity
        </div>
      ) : (
        <div style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          display: 'flex', flexDirection: 'column', gap: '2px',
        }}>
          {groups.map(group => (
            <div key={group.label}>
              {/* Day group label — only show if multiple groups */}
              {groups.length > 1 && (
                <div style={{
                  fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '6px 8px 2px',
                }}>
                  {group.label}
                </div>
              )}

              {group.items.map(item => {
                const Icon = ICON_MAP[item.icon] || Target
                return (
                  <div
                    key={item.id}
                    className="hover-bg"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '8px',
                      padding: '6px 8px', borderRadius: '8px',
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Colored dot + icon */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      flexShrink: 0, marginTop: '2px',
                    }}>
                      <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: item.color, flexShrink: 0,
                      }} />
                      <Icon size={16} weight="bold" style={{ color: item.color, flexShrink: 0 }} />
                    </div>

                    {/* Text content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          flex: 1, lineHeight: 1.3,
                        }}>
                          {item.title}
                        </span>
                        <span style={{
                          fontSize: '10px', color: 'var(--text-muted)',
                          fontFamily: 'monospace', flexShrink: 0,
                        }}>
                          {relativeTime(item.timestamp)}
                        </span>
                      </div>
                      {item.description && (
                        <div style={{
                          fontSize: '11px', color: 'var(--text-muted)',
                          lineHeight: 1.3, marginTop: '1px',
                        }}>
                          {item.description}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
