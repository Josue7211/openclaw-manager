

import { useEffect, useState, useCallback } from 'react'
import { CheckSquare, Cpu, Wifi, RefreshCw, Sun, Sunset, Moon, CalendarDays, Target, ClipboardList, ChevronDown, ChevronRight, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Skeleton, SkeletonRows } from '@/components/Skeleton'
import { BackendErrorBanner } from '@/components/BackendErrorBanner'

import { api } from '@/lib/api'

interface Todo { id: string; text: string; done: boolean; createdAt: string; due_date?: string }
interface Mission { id: string; title: string; status: string }
interface CalendarEvent { id: string; title: string; start: string; end: string; allDay: boolean; calendar: string }
interface ProxmoxVM { vmid: number; name: string; status: string; cpuPercent: number; memUsedGB: number; memTotalGB: number; node: string; }
interface ProxmoxNodeStat { node: string; cpuPercent: number; memUsedGB: number; memTotalGB: number; memPercent: number; }
interface OPNsenseData { wanIn: string; wanOut: string; updateAvailable: boolean; version: string; }
interface DailyReviewRecord { id: string; date: string; accomplishments: string; priorities: string; notes: string; created_at: string; }

const MOTIVATIONS = [
  'Ship something today. Momentum compounds.',
  'The best time to start was yesterday. The second best time is now.',
  'Focus is a force multiplier. Pick one thing.',
  'Progress, not perfection.',
  'Systems beat goals. Build the habit.',
  'Do the hard thing first. The rest gets easier.',
  'Every expert was once a beginner who didn\'t quit.',
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good morning', Icon: Sun }
  if (h < 18) return { text: 'Good afternoon', Icon: Sunset }
  return { text: 'Good evening', Icon: Moon }
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function DailyReviewWidget({ todos, missions }: { todos: Todo[]; missions: Mission[] }) {
  const today = new Date().toISOString().slice(0, 10)
  const [collapsed, setCollapsed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [review, setReview] = useState<DailyReviewRecord | null>(null)
  const [loadingReview, setLoadingReview] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ accomplishments: '', priorities: '', notes: '' })

  const fetchReview = useCallback(() => {
    setLoadingReview(true)
    api.get<{ review?: DailyReviewRecord }>(`/api/daily-review?date=${today}`)
      .then(d => { setReview(d.review || null); setLoadingReview(false) })
      .catch(() => setLoadingReview(false))
  }, [today])

  useEffect(() => { fetchReview() }, [fetchReview])

  const openModal = () => {
    setForm({
      accomplishments: review?.accomplishments || '',
      priorities: review?.priorities || '',
      notes: review?.notes || '',
    })
    setModalOpen(true)
  }

  const saveReview = async () => {
    setSaving(true)
    try {
      const d = await api.post<{ review?: DailyReviewRecord }>('/api/daily-review', { date: today, ...form })
      if (d.review) setReview(d.review)
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const completedToday = todos.filter(t => t.done).length
  const activeMissions = missions.filter(m => m.status === 'active' || m.status === 'pending').length

  return (
    <>
      <div className="card" style={{ padding: '0', marginBottom: '24px', border: '1px solid rgba(155,132,236,0.2)', overflow: 'hidden' }}>
        {/* Header row */}
        <button
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          aria-label="Toggle daily review"
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px',
            cursor: 'pointer', userSelect: 'none', width: '100%', border: 'none', fontSize: 'inherit', fontFamily: 'inherit',
            background: 'linear-gradient(90deg, rgba(155,132,236,0.07) 0%, transparent 100%)',
            borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          }}
        >
          {collapsed ? <ChevronRight size={14} style={{ color: 'var(--accent)' }} /> : <ChevronDown size={14} style={{ color: 'var(--accent)' }} />}
          <ClipboardList size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Daily Review
          </span>
          {review && (
            <span className="badge badge-green" style={{ marginLeft: '4px', fontSize: '9px' }}>logged</span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {completedToday} done · {activeMissions} active missions
            </span>
            <button
              onClick={e => { e.stopPropagation(); openModal() }}
              style={{
                background: 'var(--accent)', border: 'none', borderRadius: '10px',
                color: '#fff', padding: '5px 12px', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', letterSpacing: '0.02em',
              }}
            >
              {review ? 'Edit Review' : 'Start Daily Review'}
            </button>
          </div>
        </button>

        {/* Body */}
        {!collapsed && (
          <div style={{ padding: '16px 20px' }}>
            {loadingReview ? (
              <div style={{ display: 'flex', gap: '16px' }}>
                <Skeleton width="33%" height="60px" style={{ marginBottom: 0 }} />
                <Skeleton width="33%" height="60px" style={{ marginBottom: 0 }} />
                <Skeleton width="33%" height="60px" style={{ marginBottom: 0 }} />
              </div>
            ) : !review ? (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No review logged for today yet. Click &quot;Start Daily Review&quot; to capture your day.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <ReviewField label="Accomplishments" value={review.accomplishments} color="var(--green)" />
                <ReviewField label="Top Priority Tomorrow" value={review.priorities} color="var(--accent)" />
                <ReviewField label="Blockers / Notes" value={review.notes} color="var(--accent-blue)" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'rgba(22, 22, 28, 0.65)', border: '1px solid rgba(155,132,236,0.25)',
              borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '560px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Daily Review</h2>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{today}</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close daily review"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <ReviewPrompt
              label="1. What did you accomplish today?"
              placeholder="Shipped X, fixed Y, reviewed Z…"
              value={form.accomplishments}
              onChange={v => setForm(f => ({ ...f, accomplishments: v }))}
              accentColor="var(--green)"
            />
            <ReviewPrompt
              label="2. What's the top priority tomorrow?"
              placeholder="The single most important thing…"
              value={form.priorities}
              onChange={v => setForm(f => ({ ...f, priorities: v }))}
              accentColor="var(--accent)"
            />
            <ReviewPrompt
              label="3. Any blockers or notes?"
              placeholder="Waiting on X, context for tomorrow…"
              value={form.notes}
              onChange={v => setForm(f => ({ ...f, notes: v }))}
              accentColor="var(--accent-blue)"
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-secondary)', padding: '8px 18px', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={saveReview}
                disabled={saving}
                style={{
                  background: 'var(--accent)', border: 'none', borderRadius: '10px',
                  color: '#fff', padding: '8px 20px', fontSize: '13px', fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ReviewField({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      <p style={{ margin: 0, fontSize: '12px', color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: value ? 'normal' : 'italic', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {value || 'Nothing recorded'}
      </p>
    </div>
  )
}

function ReviewPrompt({ label, placeholder, value, onChange, accentColor }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; accentColor: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: accentColor, marginBottom: '8px' }}>{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: '100%', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)',
          outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
        onFocus={e => { e.target.style.borderColor = accentColor }}
        onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
      />
    </div>
  )
}

function DailyReview({ todos, missions, calendarEvents, mounted }: {
  todos: Todo[]
  missions: Mission[]
  calendarEvents: CalendarEvent[]
  mounted: boolean
}) {
  const now = new Date()
  const { text: greetText, Icon: GreetIcon } = getGreeting()
  const motivation = MOTIVATIONS[now.getDay() % MOTIVATIONS.length]
  const today = now.toISOString().slice(0, 10)

  const focusTodos = todos
    .filter(t => !t.done)
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
    .slice(0, 3)

  const todayEvents = calendarEvents.filter(e => {
    const eDate = e.start.slice(0, 10)
    return eDate === today
  })

  const activeMissions = missions.filter(m => m.status === 'active' || m.status === 'pending').slice(0, 3)
  const activeMissionsCount = missions.filter(m => m.status === 'active' || m.status === 'pending').length

  return (
    <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(155,132,236,0.06) 0%, var(--bg-panel) 100%)', border: '1px solid rgba(155,132,236,0.15)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <GreetIcon size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {greetText}
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {formatDate(now)}
          </p>
        </div>
        <div style={{ maxWidth: '260px', textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--accent)', fontStyle: 'italic', lineHeight: 1.5 }}>
            "{motivation}"
          </p>
        </div>
      </div>

      {/* Three columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>

        {/* Today's Focus */}
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <CheckSquare size={12} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Today&apos;s Focus</span>
          </div>
          {!mounted ? (
            <SkeletonRows count={2} />
          ) : focusTodos.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>All clear — nothing pending</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {focusTodos.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--green)', marginTop: '5px', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* On the Calendar */}
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <CalendarDays size={12} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>On the Calendar</span>
          </div>
          {!mounted ? (
            <SkeletonRows count={2} />
          ) : todayEvents.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No events today</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {todayEvents.slice(0, 3).map(e => {
                const time = e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace', marginTop: '2px', flexShrink: 0 }}>{time}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{e.title}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Active Missions */}
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Target size={12} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Active Missions</span>
            {mounted && activeMissionsCount > 0 && (
              <span className="badge badge-green" style={{ marginLeft: 'auto' }}>{activeMissionsCount}</span>
            )}
          </div>
          {!mounted ? (
            <SkeletonRows count={2} />
          ) : activeMissions.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active missions</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeMissions.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', marginTop: '5px', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{m.title}</span>
                </div>
              ))}
              {activeMissionsCount > 3 && (
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>+{activeMissionsCount - 3} more</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default function PersonalDashboard() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [todoInput, setTodoInput] = useState('')
  const [missions, setMissions] = useState<Mission[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [proxmoxVMs, setProxmoxVMs] = useState<ProxmoxVM[]>([])
  const [proxmoxNodes, setProxmoxNodes] = useState<ProxmoxNodeStat[]>([])
  const [opnsense, setOpnsense] = useState<OPNsenseData | null>(null)
  const [mounted, setMounted] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [backendError, setBackendError] = useState(false)

  const fetchTodos = useCallback(() => {
    api.get<{ todos?: Todo[] }>('/api/todos').then(d => { setBackendError(false); setTodos(d.todos || []) }).catch(() => {})
  }, [])

  const fetchMissions = useCallback(() => {
    api.get<{ missions?: Mission[] }>('/api/missions').then(d => { setBackendError(false); setMissions(d.missions || []) }).catch(() => {})
  }, [])

  const fetchCalendar = useCallback(() => {
    api.get<{ events?: CalendarEvent[] }>('/api/calendar').then(d => setCalendarEvents(d.events || [])).catch(() => {})
  }, [])

  const fetchHomelab = useCallback(async () => {
    try {
      const d = await api.get<Record<string, unknown>>('/api/homelab')
      setBackendError(false)
      if (d.proxmox?.vms) {
        const toGB = (b: number) => +(b / 1073741824).toFixed(1)
        setProxmoxVMs(d.proxmox.vms.map((v: Record<string, unknown>) => ({
          vmid: 0, node: 'pve', name: v.name, status: v.status,
          cpuPercent: Math.round((v.cpu as number) * 100),
          memUsedGB: toGB(v.mem as number), memTotalGB: 0,
        })))
        if (d.proxmox.nodes) {
          setProxmoxNodes(d.proxmox.nodes.map((n: Record<string, unknown>) => ({
            node: n.name, cpuPercent: Math.round((n.cpu as number) * 100),
            memUsedGB: toGB(n.mem_used as number), memTotalGB: toGB(n.mem_total as number),
            memPercent: Math.round(((n.mem_used as number) / (n.mem_total as number)) * 100),
          })))
        }
      }
      if (d.opnsense) {
        setOpnsense({
          wanIn: d.opnsense.wan_in ?? '—', wanOut: d.opnsense.wan_out ?? '—',
          updateAvailable: false, version: '—',
        })
      }
    } catch {
      setBackendError(true)
    }
  }, [])

  const refreshAll = useCallback(() => {
    fetchTodos()
    fetchMissions()
    fetchCalendar()
    fetchHomelab()
    setLastRefresh(new Date())
  }, [fetchTodos, fetchMissions, fetchCalendar, fetchHomelab])

  useEffect(() => {
    refreshAll()
    setMounted(true)

    let todosChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    let cacheChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    if (supabase) {
      todosChannel = supabase
        .channel('personal-todos-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => fetchTodos())
        .subscribe()

      cacheChannel = supabase
        .channel('personal-cache-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cache' }, () => fetchHomelab())
        .subscribe()
    }

    const homelabInterval = setInterval(fetchHomelab, 10000)

    return () => {
      if (todosChannel) supabase?.removeChannel(todosChannel)
      if (cacheChannel) supabase?.removeChannel(cacheChannel)
      clearInterval(homelabInterval)
    }
  }, [fetchTodos, fetchHomelab, refreshAll])

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [lastRefresh])

  const addTodo = async () => {
    if (!todoInput.trim()) return
    await api.post('/api/todos', { text: todoInput })
    setTodoInput('')
  }
  const toggleTodo = async (id: string, done: boolean) => {
    await api.patch('/api/todos', { id, done: !done })
  }
  const deleteTodo = async (id: string) => {
    await api.del('/api/todos', { id })
  }

  return (
    <div>
      {backendError && <BackendErrorBanner />}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Personal Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            home · todos · infra
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            refreshed {secondsAgo}s ago
          </span>
          <button
            onClick={refreshAll}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px',
              color: 'var(--text-secondary)', padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Morning Brief */}
      <DailyReview todos={todos} missions={missions} calendarEvents={calendarEvents} mounted={mounted} />

      {/* Daily Review Widget */}
      <DailyReviewWidget todos={todos} missions={missions} />

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>

        {/* To-Do */}
        <div className="card" style={{ padding: '20px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <CheckSquare size={14} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>To-Do</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
            {!mounted ? (
              <SkeletonRows count={3} />
            ) : todos.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No todos yet</div>
            ) : todos.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px',
                border: `1px solid ${t.done ? 'rgba(59,165,92,0.2)' : 'var(--border)'}`,
              }}>
                <input
                  type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id, t.done)}
                  style={{ cursor: 'pointer', accentColor: 'var(--green)' }}
                />
                <span style={{
                  flex: 1, fontSize: '12px',
                  color: t.done ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: t.done ? 'line-through' : 'none',
                }}>{t.text}</span>
                <button onClick={() => deleteTodo(t.id)} className="btn-delete" aria-label="Delete todo">✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={todoInput}
              onChange={e => setTodoInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
              placeholder="Add a task..."
              style={{ flex: 1, minWidth: 0, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 10px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' }}
            />
            <button onClick={addTodo} style={{ background: 'var(--green)', border: 'none', borderRadius: '10px', color: '#fff', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        {/* Proxmox VMs */}
        <div className="card" style={{ padding: '20px', maxHeight: '320px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Cpu size={14} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Proxmox VMs</span>
            {proxmoxVMs.length > 0 && (
              <span className="badge badge-green" style={{ marginLeft: 'auto' }}>
                {proxmoxVMs.filter(v => v.status === 'running').length}/{proxmoxVMs.length} running
              </span>
            )}
          </div>
          {!mounted ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              {proxmoxNodes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  {proxmoxNodes.map(n => {
                    const cpuColor = n.cpuPercent >= 85 ? 'var(--red-bright)' : n.cpuPercent >= 60 ? '#f5a623' : 'var(--green)'
                    const memColor = n.memPercent >= 85 ? 'var(--red-bright)' : n.memPercent >= 60 ? '#f5a623' : 'var(--green)'
                    return (
                      <div key={n.node}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.node}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', width: '28px' }}>CPU</span>
                            <div style={{ flex: 1, height: '5px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${n.cpuPercent}%`, height: '100%', background: cpuColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                            </div>
                            <span className="mono" style={{ fontSize: '10px', color: cpuColor, width: '32px', textAlign: 'right' }}>{n.cpuPercent}%</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', width: '28px' }}>RAM</span>
                            <div style={{ flex: 1, height: '5px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${n.memPercent}%`, height: '100%', background: memColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                            </div>
                            <span className="mono" style={{ fontSize: '10px', color: memColor, width: '32px', textAlign: 'right' }}>{n.memPercent}%</span>
                          </div>
                          <div style={{ paddingLeft: '36px' }}>
                            <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{n.memUsedGB}/{n.memTotalGB} GB</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {proxmoxVMs.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No VMs found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
                  {proxmoxVMs.map(vm => (
                    <div key={vm.vmid} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px',
                      background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {vm.name}
                        </div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {vm.node} · #{vm.vmid}
                        </div>
                      </div>
                      <span className={`badge ${vm.status === 'running' ? 'badge-green' : 'badge-gray'}`}>
                        {vm.status}
                      </span>
                      {vm.status === 'running' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', minWidth: '80px' }}>
                          <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            CPU {vm.cpuPercent}%
                          </div>
                          <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            RAM {vm.memUsedGB}/{vm.memTotalGB}G
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* OPNsense */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Wifi size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>OPNsense</span>
            {opnsense?.version && opnsense.version !== '—' && (
              <span className="mono" style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>v{opnsense.version}</span>
            )}
          </div>
          {!mounted ? (
            <div>
              <Skeleton width="100%" height="44px" />
              <Skeleton width="100%" height="44px" />
              <Skeleton width="120px" height="20px" style={{ marginBottom: 0 }} />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>WAN ↓ in</span>
                  <span className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--green)' }}>{opnsense?.wanIn ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>WAN ↑ out</span>
                  <span className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-blue)' }}>{opnsense?.wanOut ?? '—'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Firmware</span>
                {opnsense === null ? (
                  <span className="badge badge-gray">Checking…</span>
                ) : opnsense.updateAvailable ? (
                  <span className="badge" style={{ background: 'rgba(245,166,35,0.15)', color: '#f5a623', border: '1px solid rgba(245,166,35,0.3)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: 600 }}>
                    ⚠ Update available
                  </span>
                ) : (
                  <span className="badge badge-green">✓ Up to date</span>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
