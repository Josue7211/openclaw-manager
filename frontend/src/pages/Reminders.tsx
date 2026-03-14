


import { useState, useCallback, useMemo, useEffect } from 'react'
import { Bell, RefreshCw, AlertCircle } from 'lucide-react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface Reminder {
  id: string
  title: string
  completed: boolean
  dueDate: string | null
  priority: number // 1=high, 5=medium, 9=low, 0=none
  notes: string | null
  list: string
}

type FilterTab = 'all' | 'today' | 'scheduled' | 'flagged'

function priorityColor(p: number): string {
  if (p === 1) return 'var(--red-bright, #ff5f5f)'
  if (p <= 4) return '#f5a623'
  return 'var(--text-muted)'
}

function priorityLabel(p: number): string {
  if (p === 1) return '!!'
  if (p <= 4) return '!'
  return ''
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function formatDue(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: diff > 300 ? 'numeric' : undefined })
}

function dueColor(dateStr: string | null): string {
  if (!dateStr) return 'var(--text-muted)'
  const d = new Date(dateStr)
  const now = new Date()
  if (d < now) return 'var(--red-bright, #ff5f5f)'
  if (isToday(dateStr)) return '#f5a623'
  return 'var(--accent-blue, #5ac8fa)'
}

interface RemindersResponse {
  reminders?: Reminder[]
  error?: string
}

export default function RemindersPage() {
  const { data: remindersData, isLoading: loading, refetch, dataUpdatedAt } = useTauriQuery<RemindersResponse>(
    ['reminders'],
    '/api/reminders',
  )

  const reminders = remindersData?.reminders ?? []
  const missingCreds = remindersData?.error === 'missing_credentials'
  const errorMsg = remindersData?.error && remindersData.error !== 'missing_credentials' ? remindersData.error : null

  const [filter, setFilter] = useState<FilterTab>('all')
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date()

  useEffect(() => {
    const t = setInterval(() => setSecondsAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 1000)), 1000)
    return () => clearInterval(t)
  }, [lastRefresh])

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      await api.patch('/api/reminders', { id, completed })
    },
  })

  const toggle = useCallback(async (id: string, currentCompleted: boolean) => {
    const newVal = !currentCompleted
    setOptimistic(o => ({ ...o, [id]: newVal }))
    try {
      await toggleMutation.mutateAsync({ id, completed: newVal })
    } catch {
      // revert on error
      setOptimistic(o => ({ ...o, [id]: currentCompleted }))
    }
  }, [toggleMutation])

  const displayReminders = useMemo(() => {
    return reminders.map(r => ({ ...r, completed: r.id in optimistic ? optimistic[r.id] : r.completed }))
  }, [reminders, optimistic])

  const filtered = useMemo(() => {
    let list = displayReminders.filter(r => !r.completed)
    if (filter === 'today') list = list.filter(r => isToday(r.dueDate))
    else if (filter === 'scheduled') list = list.filter(r => r.dueDate)
    else if (filter === 'flagged') list = list.filter(r => r.priority === 1)
    return list
  }, [displayReminders, filter])

  const grouped = useMemo(() => {
    const groups: Record<string, Reminder[]> = {}
    for (const r of filtered) {
      if (!groups[r.list]) groups[r.list] = []
      groups[r.list].push(r)
    }
    return groups
  }, [filtered])

  const tabs: { id: FilterTab; label: string; count: number }[] = useMemo(() => [
    { id: 'all', label: 'All', count: displayReminders.filter(r => !r.completed).length },
    { id: 'today', label: 'Today', count: displayReminders.filter(r => !r.completed && isToday(r.dueDate)).length },
    { id: 'scheduled', label: 'Scheduled', count: displayReminders.filter(r => !r.completed && !!r.dueDate).length },
    { id: 'flagged', label: 'Flagged', count: displayReminders.filter(r => !r.completed && r.priority === 1).length },
  ], [displayReminders])

  if (missingCreds) {
    return (
      <div style={{ maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <Bell size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Reminders</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <AlertCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>iCloud not configured</h2>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            To sync iCloud Reminders, add your credentials to your environment:
          </p>
          <div style={{
            background: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border)',
            padding: '16px 20px', textAlign: 'left', fontFamily: 'monospace', fontSize: '12px',
            color: 'var(--text-secondary)', lineHeight: 2,
          }}>
            <div><span style={{ color: 'var(--text-muted)' }}># .env.local</span></div>
            <div>CALDAV_URL=https://caldav.icloud.com</div>
            <div>CALDAV_USERNAME=your@icloud.com</div>
            <div>CALDAV_PASSWORD=your-app-specific-password</div>
          </div>
          <p style={{ margin: '16px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
            Generate an app-specific password at appleid.apple.com
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Reminders</h1>
          {!loading && (
            <span className="badge badge-green" style={{ marginLeft: '4px' }}>
              {displayReminders.filter(r => !r.completed).length} pending
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!loading && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {secondsAgo}s ago
            </span>
          )}
          <button
            onClick={() => { setOptimistic({}); refetch() }}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-secondary)', padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
              background: filter === tab.id ? 'var(--accent)' : 'var(--bg-panel)',
              color: filter === tab.id ? '#fff' : 'var(--text-secondary)',
              border: filter === tab.id ? '1px solid var(--accent)' : '1px solid var(--border)',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                marginLeft: '6px', fontSize: '10px', fontWeight: 700,
                background: filter === tab.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-base)',
                borderRadius: '10px', padding: '1px 6px',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {errorMsg && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          background: 'rgba(255,95,95,0.1)', border: '1px solid rgba(255,95,95,0.3)',
          color: 'var(--red-bright, #ff5f5f)', fontSize: '12px',
        }}>
          {errorMsg}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              height: '52px', borderRadius: '8px',
              background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-panel) 50%, var(--bg-elevated) 75%)',
              backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
            }} />
          ))}
        </div>
      )}

      {/* Content */}
      {!loading && !errorMsg && (
        <>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
              {filter === 'today' ? 'Nothing due today' : filter === 'scheduled' ? 'No scheduled reminders' : filter === 'flagged' ? 'No flagged reminders' : 'All caught up!'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {Object.entries(grouped).map(([listName, items]) => (
                <div key={listName}>
                  <div style={{
                    fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <Bell size={10} style={{ color: 'var(--accent)' }} />
                    {listName}
                    <span style={{
                      background: 'var(--bg-elevated)', borderRadius: '10px',
                      padding: '1px 7px', fontSize: '10px', color: 'var(--text-secondary)',
                    }}>{items.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {items.map(reminder => {
                      const dueFmt = formatDue(reminder.dueDate)
                      const dc = dueColor(reminder.dueDate)
                      const pc = priorityColor(reminder.priority)
                      const pl = priorityLabel(reminder.priority)
                      const isCompleted = reminder.id in optimistic ? optimistic[reminder.id] : reminder.completed

                      return (
                        <div
                          key={reminder.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '12px',
                            padding: '12px 14px',
                            background: isCompleted ? 'var(--bg-base)' : 'var(--bg-panel)',
                            borderRadius: '8px',
                            border: isCompleted ? '1px solid rgba(59,165,92,0.15)' : '1px solid var(--border)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={() => toggle(reminder.id, isCompleted)}
                            style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '16px', height: '16px', flexShrink: 0, marginTop: '1px' }}
                          />

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {pl && (
                                <span style={{ fontSize: '11px', fontWeight: 800, color: pc, flexShrink: 0 }}>{pl}</span>
                              )}
                              <span style={{
                                fontSize: '13px',
                                color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                                textDecoration: isCompleted ? 'line-through' : 'none',
                                lineHeight: 1.4,
                              }}>
                                {reminder.title}
                              </span>
                            </div>
                            {reminder.notes && (
                              <div style={{
                                marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {reminder.notes}
                              </div>
                            )}
                          </div>

                          {/* Due date */}
                          {dueFmt && (
                            <span style={{
                              fontSize: '11px', fontWeight: 500, color: dc,
                              flexShrink: 0, fontFamily: 'monospace',
                            }}>
                              {dueFmt}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
