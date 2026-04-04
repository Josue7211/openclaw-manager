import React, { useMemo } from 'react'
import { Bell, ArrowRight, WarningCircle } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useRemindersWidget } from '@/lib/hooks/dashboard/useRemindersWidget'
import type { WidgetProps } from '@/lib/widget-registry'
import type { Reminder } from '@/lib/types'

const PRIORITY_COLORS: Record<number, string> = {
  1: 'var(--red-500)',   // high
  2: 'var(--orange)',    // medium
  3: 'var(--green-500)', // low
}

function priorityLabel(p?: number): string {
  if (p === 1) return 'High'
  if (p === 2) return 'Medium'
  return 'Low'
}

export const RemindersWidget = React.memo(function RemindersWidget({ config }: WidgetProps) {
  const { reminders, todayReminders, pendingCount, toggleReminder, mounted, isError } = useRemindersWidget()
  const navigate = useNavigate()

  const maxItems = Number(config.maxItems ?? 5)
  const filter = String(config.filter ?? 'today')

  const displayReminders = useMemo(() => {
    let items: Reminder[]
    if (filter === 'today') {
      items = todayReminders.length > 0
        ? todayReminders
        : reminders.filter((r: Reminder) => !r.completed)
    } else if (filter === 'flagged') {
      items = reminders.filter((r: Reminder) => !r.completed && r.priority === 1)
    } else {
      // 'pending'
      items = reminders.filter((r: Reminder) => !r.completed)
    }
    return items.slice(0, maxItems)
  }, [reminders, todayReminders, maxItems, filter])

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Bell size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Reminders
        </span>
        {mounted && pendingCount > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            fontWeight: 600, lineHeight: 1,
          }}>
            {pendingCount}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : isError ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 0' }}>
          <WarningCircle size={20} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Mac Bridge not reachable
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', opacity: 0.7 }}>
            Configure in Settings
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
          {displayReminders.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No pending reminders
            </div>
          ) : (
            displayReminders.map((reminder: Reminder) => (
              <label
                key={reminder.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s',
                }}
                className="hover-bg"
              >
                <input
                  type="checkbox"
                  checked={reminder.completed}
                  onChange={() => toggleReminder(reminder.id, reminder.completed)}
                  aria-label={`Toggle ${reminder.title}`}
                  style={{
                    width: '14px', height: '14px', accentColor: 'var(--accent)',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                />
                {/* Priority indicator */}
                <span
                  aria-label={`Priority: ${priorityLabel(reminder.priority)}`}
                  style={{
                    width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                    background: PRIORITY_COLORS[reminder.priority ?? 3] ?? 'var(--green-500)',
                  }}
                />
                <span style={{
                  fontSize: '12px',
                  color: reminder.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: reminder.completed ? 'line-through' : 'none',
                  flex: 1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {reminder.title}
                </span>
                {reminder.dueDate && (
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0,
                    fontFamily: 'monospace',
                  }}>
                    {formatReminderDate(reminder.dueDate)}
                  </span>
                )}
              </label>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/reminders')}
            aria-label="View all reminders"
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

function formatReminderDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  if (dateStr < today) return 'Overdue'
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  if (dateStr === tomorrow) return 'Tomorrow'
  return dateStr.slice(5) // MM-DD
}
