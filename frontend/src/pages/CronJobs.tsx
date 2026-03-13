


import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Zap, Clock } from 'lucide-react'
import { useTauriQuery } from '@/hooks/useTauriQuery'

interface CronSchedule {
  kind: string
  everyMs?: number
  expr?: string
}

interface CronState {
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastRunStatus?: string
}

interface CronJob {
  id: string
  name: string
  description?: string
  schedule: CronSchedule
  state?: CronState
  createdAtMs?: number
  createdAt?: string
  enabled?: boolean
}

const COLORS = ['#9b84ec', '#60a5fa', '#4ade80', '#fb923c', '#f472b6', '#2dd4bf', '#facc15']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_HEIGHT = 60 // px per hour (60px = 60min, 1px per minute)
const TOTAL_HEIGHT = 24 * HOUR_HEIGHT // 1440px
const FREQUENT_MS = 3600000 // < 1 hour = too frequent for grid

const navBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  background: 'transparent',
  border: '1px solid #2a2a2a',
  borderRadius: '6px',
  color: 'var(--text-secondary)',
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: '12px',
  whiteSpace: 'nowrap',
}

function humanSchedule(job: CronJob): string {
  const s = job.schedule
  if (s.kind === 'every' && s.everyMs) {
    const ms = s.everyMs
    const hours = ms / 3600000
    if (hours >= 24 && hours % 24 === 0) return `every ${hours / 24}d`
    if (hours >= 1) return `every ${hours % 1 === 0 ? hours : hours.toFixed(1)}h`
    const mins = ms / 60000
    if (mins >= 1) return `every ${mins % 1 === 0 ? mins : mins.toFixed(0)}m`
    return `every ${ms}ms`
  }
  if (s.kind === 'cron' && s.expr) return s.expr
  return s.kind || 'unknown'
}

function relativeTime(ms: number): string {
  const diff = ms - Date.now()
  const abs = Math.abs(diff)
  const past = diff < 0
  if (abs < 60000) return past ? 'just now' : 'in <1m'
  if (abs < 3600000) {
    const m = Math.round(abs / 60000)
    return past ? `${m}m ago` : `in ${m}m`
  }
  if (abs < 86400000) {
    const h = Math.round(abs / 3600000)
    return past ? `${h}h ago` : `in ${h}h`
  }
  const d = Math.round(abs / 86400000)
  return past ? `${d}d ago` : `in ${d}d`
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function formatWeekLabel(weekStart: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `Week of ${weekStart.toLocaleDateString(undefined, opts)}`
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h > 12 ? `${h - 12} PM` : `${h} AM`
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface FireTime {
  ms: number
  dayIndex: number
  top: number // px from top of day column
}

function getFireTimesInWeek(job: CronJob, weekStart: Date): FireTime[] {
  const fires: FireTime[] = []
  const weekStartMs = weekStart.getTime()
  const weekEndMs = weekStartMs + 7 * 24 * 3600000
  const s = job.schedule

  if (s.kind === 'every' && s.everyMs) {
    const interval = s.everyMs
    const anchor =
      job.state?.nextRunAtMs ??
      job.createdAtMs ??
      (job.createdAt ? new Date(job.createdAt).getTime() : Date.now())

    let t = anchor
    if (t >= weekStartMs) {
      while (t - interval >= weekStartMs) t -= interval
    } else {
      const steps = Math.ceil((weekStartMs - t) / interval)
      t += steps * interval
    }

    while (t < weekEndMs) {
      if (t >= weekStartMs) {
        const d = new Date(t)
        const hours = d.getHours()
        const minutes = d.getMinutes()
        fires.push({
          ms: t,
          dayIndex: d.getDay(),
          top: hours * 60 + minutes, // 1px per minute
        })
      }
      t += interval
    }
  }

  return fires
}

export default function CronsPage() {
  const { data: cronsData, isLoading: loading } = useTauriQuery<{ jobs: CronJob[] }>(
    ['crons'],
    '/api/crons',
  )
  const jobs = cronsData?.jobs ?? []

  const [weekOffset, setWeekOffset] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = useRef(new Date()).current

  useEffect(() => {
    if (!loading && scrollRef.current) {
      const currentHour = now.getHours() + now.getMinutes() / 60
      scrollRef.current.scrollTop = Math.max(0, currentHour * HOUR_HEIGHT - 200)
    }
  }, [loading, now])

  const baseWeekStart = getWeekStart(now)
  const weekStart = new Date(baseWeekStart)
  weekStart.setDate(weekStart.getDate() + weekOffset * 7)
  const isCurrentWeek = weekOffset === 0
  const todayDow = now.getDay()

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // Partition: frequent jobs (< 1h) go to top bar, rest go to grid
  const frequentJobs = jobs.filter(
    j => j.schedule.kind === 'every' && j.schedule.everyMs && j.schedule.everyMs < FREQUENT_MS
  )
  const gridJobs = jobs.filter(
    j => !(j.schedule.kind === 'every' && j.schedule.everyMs && j.schedule.everyMs < FREQUENT_MS)
  )

  // Build per-day fire lists
  type DayFire = { job: CronJob; jobIndex: number; fire: FireTime }
  const dayFires: DayFire[][] = Array.from({ length: 7 }, () => [])
  gridJobs.forEach(job => {
    const ji = jobs.indexOf(job)
    getFireTimesInWeek(job, weekStart).forEach(fire => {
      dayFires[fire.dayIndex].push({ job, jobIndex: ji, fire })
    })
  })

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const nowTop = (now.getHours() * 60 + now.getMinutes()) // px from top

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Cron Calendar
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            automated routines · week view
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtnStyle}>
            <ChevronLeft size={13} /> Prev
          </button>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '160px', textAlign: 'center' }}>
            {formatWeekLabel(weekStart)}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtnStyle}>
            Next <ChevronRight size={13} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            style={{
              ...navBtnStyle,
              background: isCurrentWeek ? 'rgba(155,132,236,0.15)' : 'transparent',
              borderColor: isCurrentWeek ? '#9b84ec' : '#2a2a2a',
              color: isCurrentWeek ? '#9b84ec' : 'var(--text-secondary)',
            }}
          >
            Today
          </button>
        </div>
      </div>

      {/* Frequent bar */}
      {frequentJobs.length > 0 && (
        <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '12px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Zap size={12} style={{ color: '#fb923c' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Frequent
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>&lt; 1h interval</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {frequentJobs.map(job => {
              const color = COLORS[jobs.indexOf(job) % COLORS.length]
              return (
                <div
                  key={job.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: `${color}18`,
                    border: `1px solid ${color}44`,
                    borderRadius: '20px',
                    padding: '4px 12px',
                  }}
                >
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{job.name}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {humanSchedule(job)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Week grid */}
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, flexShrink: 0 }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid #2a2a2a', flexShrink: 0 }}>
          <div style={{ borderRight: '1px solid #2a2a2a' }} />
          {weekDays.map((d, i) => {
            const isToday = isCurrentWeek && i === todayDow
            return (
              <div
                key={i}
                style={{
                  padding: '10px 8px',
                  textAlign: 'center',
                  borderRight: i < 6 ? '1px solid #2a2a2a' : undefined,
                  background: isToday ? 'rgba(155,132,236,0.08)' : undefined,
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 700, color: isToday ? '#9b84ec' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {DAY_NAMES[i]}
                </div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: isToday ? '#9b84ec' : 'var(--text-secondary)', marginTop: '2px', lineHeight: 1 }}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Scrollable time body */}
        <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: '580px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', height: `${TOTAL_HEIGHT}px`, position: 'relative' }}>
            {/* Time axis */}
            <div style={{ borderRight: '1px solid #2a2a2a', position: 'relative' }}>
              {hours.map(h => (
                <div
                  key={h}
                  style={{
                    position: 'absolute',
                    top: h * HOUR_HEIGHT,
                    left: 0,
                    right: 0,
                    height: HOUR_HEIGHT,
                    borderTop: h > 0 ? '1px solid #1e1e1e' : undefined,
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '3px 5px 0',
                  }}
                >
                  {h > 0 && (
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: 1, whiteSpace: 'nowrap' }}>
                      {formatHour(h)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {Array.from({ length: 7 }, (_, colIdx) => {
              const isToday = isCurrentWeek && colIdx === todayDow
              const fires = dayFires[colIdx].sort((a, b) => a.fire.top - b.fire.top)

              // Overlap layout: assign horizontal slots
              type Placed = { item: DayFire; col: number; totalCols: number }
              const placed: Placed[] = []

              for (const item of fires) {
                const top = item.fire.top
                const bottom = top + 52
                const occupiedCols = placed
                  .filter(p => !(bottom <= p.item.fire.top || top >= p.item.fire.top + 52))
                  .map(p => p.col)
                let col = 0
                while (occupiedCols.includes(col)) col++
                placed.push({ item, col, totalCols: 1 })
              }

              // Second pass: set totalCols from max overlapping col
              for (const p of placed) {
                const pTop = p.item.fire.top
                const pBottom = pTop + 52
                const maxCol = placed
                  .filter(q => !(pBottom <= q.item.fire.top || pTop >= q.item.fire.top + 52))
                  .reduce((m, q) => Math.max(m, q.col + 1), 1)
                p.totalCols = maxCol
              }

              return (
                <div
                  key={colIdx}
                  style={{
                    position: 'relative',
                    borderRight: colIdx < 6 ? '1px solid #2a2a2a' : undefined,
                    background: isToday ? 'rgba(155,132,236,0.025)' : undefined,
                  }}
                >
                  {/* Hour grid lines */}
                  {hours.map(h => (
                    <div
                      key={h}
                      style={{
                        position: 'absolute',
                        top: h * HOUR_HEIGHT,
                        left: 0,
                        right: 0,
                        height: HOUR_HEIGHT,
                        borderTop: '1px solid #1e1e1e',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && (
                    <div
                      style={{
                        position: 'absolute',
                        top: nowTop,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: '#9b84ec',
                        zIndex: 10,
                        pointerEvents: 'none',
                      }}
                    >
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9b84ec', marginTop: '-3px', marginLeft: '-1px' }} />
                    </div>
                  )}

                  {/* Event pills */}
                  {placed.map(({ item, col, totalCols }) => {
                    const color = COLORS[item.jobIndex % COLORS.length]
                    const colW = 100 / totalCols
                    return (
                      <div
                        key={`${item.job.id}-${item.fire.ms}`}
                        title={`${item.job.name}\n${formatTime(item.fire.ms)}`}
                        style={{
                          position: 'absolute',
                          top: item.fire.top + 2,
                          left: `calc(${col * colW}% + 2px)`,
                          width: `calc(${colW}% - 4px)`,
                          minHeight: '52px',
                          background: `${color}18`,
                          border: `1px solid ${color}44`,
                          borderLeft: `3px solid ${color}`,
                          borderRadius: '4px',
                          padding: '4px 5px',
                          overflow: 'hidden',
                          zIndex: 5,
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.3' }}>
                          {item.job.name}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                          {formatTime(item.fire.ms)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Job list */}
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '16px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Clock size={13} style={{ color: '#9b84ec' }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            All Cron Jobs
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>({jobs.length})</span>
        </div>

        {loading ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading…</div>
        ) : jobs.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No cron jobs found</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {jobs.map((job, ji) => {
              const color = COLORS[ji % COLORS.length]
              const nextRun = job.state?.nextRunAtMs
              const enabled = job.enabled ?? true
              return (
                <div
                  key={job.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Color dot */}
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />

                  {/* Name */}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {job.name}
                  </span>

                  {/* Schedule */}
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color, background: `${color}18`, border: `1px solid ${color}33`, padding: '1px 7px', borderRadius: '4px', flexShrink: 0 }}>
                    {humanSchedule(job)}
                  </span>

                  {/* Next run */}
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: '60px', textAlign: 'right', flexShrink: 0 }}>
                    {nextRun ? relativeTime(nextRun) : '—'}
                  </span>

                  {/* Badge */}
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    background: enabled ? 'rgba(74,222,128,0.12)' : 'transparent',
                    color: enabled ? '#4ade80' : 'var(--text-muted)',
                    border: `1px solid ${enabled ? 'rgba(74,222,128,0.3)' : '#2a2a2a'}`,
                    flexShrink: 0,
                    minWidth: '60px',
                    textAlign: 'center',
                  }}>
                    {enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
