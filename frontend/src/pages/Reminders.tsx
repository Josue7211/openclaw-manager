


import { useState, useCallback, useMemo, useEffect } from 'react'
import { Bell, ArrowsClockwise, WarningCircle, Plus, Trash } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { PageHeader } from '@/components/PageHeader'

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
  if (p === 1) return 'var(--red-bright)'
  if (p === 5) return 'var(--amber-warm)'
  return 'var(--text-muted)'
}

function priorityLabel(p: number): string {
  if (p === 1) return '!!'
  if (p === 5) return '!'
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
  if (d < now) return 'var(--red-bright)'
  if (isToday(dateStr)) return 'var(--amber-warm)'
  return 'var(--apple-cyan)'
}

interface RemindersResponse {
  reminders?: Reminder[]
  error?: string
  message?: string
}

const DEMO_REMINDERS: Reminder[] = [
  { id: 'demo-r1', title: 'Review pull request', completed: false, priority: 1, notes: null, list: 'Work', dueDate: new Date().toISOString().slice(0, 10) },
  { id: 'demo-r2', title: 'Buy groceries', completed: false, priority: 9, notes: null, list: 'Personal', dueDate: new Date().toISOString().slice(0, 10) },
  { id: 'demo-r3', title: 'Deploy staging build', completed: false, priority: 5, notes: 'Run integration tests first', list: 'Work', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
  { id: 'demo-r4', title: 'Update documentation', completed: true, priority: 9, notes: null, list: 'Work', dueDate: null },
]

export default function RemindersPage() {
  const demo = isDemoMode()
  const { data: remindersData, isLoading: loading, isError: queryError, refetch, dataUpdatedAt } = useTauriQuery<RemindersResponse>(
    ['reminders'],
    '/api/reminders',
    { enabled: !demo },
  )

  const reminders = demo ? DEMO_REMINDERS : remindersData?.reminders ?? []
  const bridgeNotConfigured = !demo && remindersData?.error === 'bridge_not_configured'
  const missingCreds = !demo && remindersData?.error === 'missing_credentials'
  const unreachable = !demo && (remindersData?.error === 'bridge_unreachable' || (queryError && !remindersData))
  const errorMsg = !demo && remindersData?.error && !['missing_credentials', 'bridge_not_configured', 'bridge_unreachable'].includes(remindersData.error) ? remindersData.error : null

  const [filter, setFilter] = useState<FilterTab>('all')
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newList, setNewList] = useState('Reminders')
  const [newPriority, setNewPriority] = useState(0)
  const [newNotes, setNewNotes] = useState('')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())

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

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/reminders', {
        title: newTitle.trim(),
        dueDate: newDueDate || null,
        list: newList.trim() || 'Reminders',
        priority: newPriority,
        notes: newNotes.trim(),
      })
    },
    onSuccess: async () => {
      setNewTitle('')
      setNewDueDate('')
      setNewPriority(0)
      setNewNotes('')
      setMutationError(null)
      await refetch()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/api/reminders?id=${encodeURIComponent(id)}`)
    },
    onSuccess: async () => {
      setMutationError(null)
      await refetch()
    },
  })

  const createReminder = useCallback(async () => {
    if (!newTitle.trim() || createMutation.isPending) return
    try {
      await createMutation.mutateAsync()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Could not create Apple Reminder')
    }
  }, [createMutation, newDueDate, newList, newNotes, newPriority, newTitle])

  const toggle = useCallback(async (id: string, currentCompleted: boolean) => {
    const newVal = !currentCompleted
    setOptimistic(o => ({ ...o, [id]: newVal }))
    try {
      await toggleMutation.mutateAsync({ id, completed: newVal })
      setMutationError(null)
    } catch {
      // revert on error
      setOptimistic(o => ({ ...o, [id]: currentCompleted }))
      setMutationError('Could not update reminder')
    }
  }, [toggleMutation])

  const deleteReminder = useCallback(async (id: string) => {
    setDeletingIds(prev => new Set(prev).add(id))
    try {
      await deleteMutation.mutateAsync(id)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Could not delete reminder')
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [deleteMutation])

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

  if (missingCreds || bridgeNotConfigured) {
    return (
      <div style={{ maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <Bell size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Reminders</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <WarningCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {bridgeNotConfigured ? 'Mac Bridge not connected' : 'iCloud not configured'}
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {bridgeNotConfigured
              ? 'Connect Mac Bridge in Settings so clawctrl can create, update, and delete Apple Reminders.'
              : 'To sync iCloud Reminders, add your credentials to your environment:'}
          </p>
          {!bridgeNotConfigured && (
            <>
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
            </>
          )}
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
          <PageHeader defaultTitle="Reminders" />
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
            <ArrowsClockwise size={12} />
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
              color: filter === tab.id ? 'var(--text-on-color)' : 'var(--text-secondary)',
              border: filter === tab.id ? '1px solid var(--accent)' : '1px solid var(--border)',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                marginLeft: '6px', fontSize: '10px', fontWeight: 700,
                background: filter === tab.id ? 'var(--bg-white-25)' : 'var(--bg-base)',
                borderRadius: '10px', padding: '1px 6px',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {!errorMsg && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1fr) 130px 120px 96px auto',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '16px',
          padding: '10px',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          background: 'var(--bg-panel)',
        }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createReminder()}
            placeholder="New reminder..."
            aria-label="New reminder title"
            style={{
              minWidth: 0,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              padding: '8px 10px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <input
            type="date"
            value={newDueDate}
            onChange={e => setNewDueDate(e.target.value)}
            aria-label="New reminder due date"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              padding: '7px 8px',
              fontSize: '12px',
              colorScheme: 'dark',
              minWidth: 0,
            }}
          />
          <input
            value={newList}
            onChange={e => setNewList(e.target.value)}
            aria-label="New reminder list"
            style={{
              minWidth: 0,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              padding: '8px 10px',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          <select
            value={newPriority}
            onChange={e => setNewPriority(Number(e.target.value))}
            aria-label="New reminder priority"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              padding: '8px 8px',
              fontSize: '12px',
              outline: 'none',
            }}
          >
            <option value={0}>None</option>
            <option value={1}>High</option>
            <option value={5}>Medium</option>
            <option value={9}>Low</option>
          </select>
          <button
            type="button"
            onClick={createReminder}
            disabled={!newTitle.trim() || createMutation.isPending}
            aria-label="Create reminder"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: 'none',
              background: !newTitle.trim() || createMutation.isPending ? 'var(--bg-elevated)' : 'var(--accent)',
              color: !newTitle.trim() || createMutation.isPending ? 'var(--text-muted)' : 'var(--text-on-color)',
              cursor: !newTitle.trim() || createMutation.isPending ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={16} />
          </button>
          <input
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            placeholder="Notes"
            aria-label="New reminder notes"
            style={{
              gridColumn: '1 / -1',
              minWidth: 0,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              padding: '8px 10px',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>
      )}

      {mutationError && (
        <div style={{
          marginBottom: '14px',
          padding: '10px 12px',
          border: '1px solid var(--red-500-a20)',
          borderRadius: '8px',
          background: 'var(--red-500-a12)',
          color: 'var(--red)',
          fontSize: '12px',
        }}>
          {mutationError}
        </div>
      )}

      {/* Error — body-level error from backend */}
      {errorMsg && (
        <ErrorState resource="reminders" onRetry={() => refetch()} />
      )}

      {/* Error — query failed (backend/Mac Bridge unreachable) */}
      {unreachable && (
        <div className="card" style={{ padding: '32px', textAlign: 'center', marginBottom: '16px' }}>
          <WarningCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Reminders are temporarily unavailable
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            clawctrl could not reach the Mac Bridge service that syncs Apple Reminders from your Mac.
            New reminders are only created when Apple Reminders accepts them.
          </p>
          <button
            onClick={() => refetch()}
            style={{
              background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none',
              borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && !unreachable && (
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
      {!loading && !errorMsg && !unreachable && (
        <>
          {filtered.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={filter === 'today' ? 'Nothing due today' : filter === 'scheduled' ? 'No scheduled reminders' : filter === 'flagged' ? 'No flagged reminders' : 'All caught up!'}
            />
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
                            border: isCompleted ? '1px solid var(--secondary-a15)' : '1px solid var(--border)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={() => toggle(reminder.id, isCompleted)}
                            aria-label={`Toggle "${reminder.title}"`}
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
                          <button
                            type="button"
                            onClick={() => deleteReminder(reminder.id)}
                            disabled={deletingIds.has(reminder.id)}
                            aria-label={`Delete "${reminder.title}"`}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid var(--border)',
                              background: 'transparent',
                              color: deletingIds.has(reminder.id) ? 'var(--text-muted)' : 'var(--red)',
                              cursor: deletingIds.has(reminder.id) ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Trash size={13} />
                          </button>
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
