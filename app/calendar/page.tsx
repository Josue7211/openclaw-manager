'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  calendar: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

const PALETTE = [
  '#9b84ec', '#5865f2', '#3ba55c', '#ed4245', '#f5a623',
  '#57d687', '#818cf8', '#b9a8ff', '#ff6467',
]

function calendarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10)
}

function parseLocalDate(iso: string): Date {
  // Avoid UTC shift by treating "YYYY-MM-DD" as local noon
  if (iso.length === 10) return new Date(iso + 'T12:00:00')
  return new Date(iso)
}

function isoToMinutes(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function formatTime(iso: string): string {
  if (iso.length === 10) return 'All day'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

/** Monday of the week containing `date` */
function weekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

const GRID_START = 5   // 5 AM
const GRID_END   = 23  // 11 PM  (last row label = 11 PM)

// ── main component ────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [missingCreds, setMissingCreds] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // view: 'week' | 'month'
  const [view, setView] = useState<'week' | 'month'>('week')

  // anchor: start of current week (week view) or any date in current month (month view)
  const [anchor, setAnchor] = useState<Date>(() => weekStart(today))

  // selected date for side panel (month view)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hourHeight, setHourHeight] = useState(56)

  // Dynamically size hour height to fit viewport
  useEffect(() => {
    function resize() {
      if (!containerRef.current) return
      // Available height = viewport - top of container - bottom padding
      const top = containerRef.current.getBoundingClientRect().top
      const available = window.innerHeight - top - 16
      // header row ~48px, reserve space
      const gridAvailable = available - 52
      const computed = Math.max(Math.floor(gridAvailable / (GRID_END - GRID_START)), 28)
      setHourHeight(Math.min(computed, 56))
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [loading, view])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/calendar')
      const data = await res.json()
      if (data.error === 'missing_credentials') {
        setMissingCreds(true)
      } else if (data.error) {
        setError(data.message || 'Failed to load calendar')
      } else {
        setEvents(data.events || [])
      }
    } catch {
      setError('Failed to connect to calendar API')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // Scroll week grid to 8 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - GRID_START) * hourHeight - 8
    }
  }, [view, hourHeight])

  // ── navigation ──────────────────────────────────────────────────────────────

  function goToday() {
    if (view === 'week') setAnchor(weekStart(today))
    else setAnchor(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  function goPrev() {
    if (view === 'week') setAnchor(d => addDays(d, -7))
    else setAnchor(d => addMonths(d, -1))
  }

  function goNext() {
    if (view === 'week') setAnchor(d => addDays(d, 7))
    else setAnchor(d => addMonths(d, 1))
  }

  function switchToWeek(dateKey?: string) {
    const base = dateKey ? parseLocalDate(dateKey) : anchor
    setAnchor(weekStart(base))
    setView('week')
    setSelectedDate(null)
  }

  // ── derived data ─────────────────────────────────────────────────────────────

  const todayKey = toDateKey(today.toISOString())

  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    const key = toDateKey(ev.start)
    if (!eventsByDate[key]) eventsByDate[key] = []
    eventsByDate[key].push(ev)
  }

  // ── header label ─────────────────────────────────────────────────────────────

  function headerLabel(): string {
    if (view === 'week') {
      const start = anchor
      const end = addDays(anchor, 6)
      if (start.getMonth() === end.getMonth()) {
        return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
      }
      return `${MONTH_NAMES[start.getMonth()]} – ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`
    }
    return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
  }

  // ── shared styles ─────────────────────────────────────────────────────────────

  const btnStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '5px 10px',
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    gap: '4px',
    transition: 'border-color 0.15s, color 0.15s',
  }

  const activeTabStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'rgba(155,132,236,0.15)',
    border: '1px solid rgba(155,132,236,0.4)',
    color: 'var(--accent-bright)',
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WEEK VIEW
  // ─────────────────────────────────────────────────────────────────────────────

  function WeekView() {
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
    const hours = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i)

    // Partition events for the visible week
    const allDayEvents: CalendarEvent[] = []
    const timedEventsByDay: Record<string, CalendarEvent[]> = {}

    for (const ev of events) {
      const key = toDateKey(ev.start)
      const evDate = parseLocalDate(ev.start)
      evDate.setHours(0, 0, 0, 0)
      const inWeek = weekDays.some(d => toDateKey(d.toISOString()) === key)
      if (!inWeek) continue
      if (ev.allDay || ev.start.length === 10) {
        allDayEvents.push(ev)
      } else {
        if (!timedEventsByDay[key]) timedEventsByDay[key] = []
        timedEventsByDay[key].push(ev)
      }
    }

    // Current time marker
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
    const nowTop = ((nowMinutes - GRID_START * 60) / 60) * hourHeight
    const showNowLine = weekDays.some(d => toDateKey(d.toISOString()) === todayKey)

    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Day header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div /> {/* time gutter */}
          {weekDays.map((d, i) => {
            const key = toDateKey(d.toISOString())
            const isToday = key === todayKey
            return (
              <button
                key={i}
                onClick={() => { setSelectedDate(key); setView('month') }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderLeft: '1px solid var(--border)',
                  cursor: 'pointer',
                  padding: '12px 4px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {DAY_LABELS[i]}
                </span>
                <span style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: isToday ? 700 : 400,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--text-primary)',
                }}>
                  {d.getDate()}
                </span>
              </button>
            )
          })}
        </div>

        {/* All-day strip */}
        {allDayEvents.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ padding: '4px 6px 4px', fontSize: '9px', color: 'var(--text-muted)', textAlign: 'right', alignSelf: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>all‑day</div>
            {weekDays.map((d, i) => {
              const key = toDateKey(d.toISOString())
              const dayAll = allDayEvents.filter(e => toDateKey(e.start) === key)
              return (
                <div key={i} style={{ borderLeft: '1px solid var(--border)', padding: '3px 2px', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: '28px' }}>
                  {dayAll.map(ev => (
                    <div key={ev.id} style={{
                      background: calendarColor(ev.calendar) + '33',
                      borderLeft: `2px solid ${calendarColor(ev.calendar)}`,
                      borderRadius: '3px',
                      padding: '1px 4px',
                      fontSize: '10px',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}>
                      {ev.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Time grid */}
        <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', position: 'relative' }}>
            {/* Hour rows */}
            {hours.map(h => (
              <div key={h} style={{ display: 'contents' }}>
                {/* Time label */}
                <div style={{
                  height: `${hourHeight}px`,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end',
                  paddingRight: '8px',
                  paddingTop: '2px',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  userSelect: 'none',
                }}>
                  {formatHour(h)}
                </div>
                {/* 7 day cells */}
                {weekDays.map((_, di) => (
                  <div key={di} style={{
                    height: `${hourHeight}px`,
                    borderLeft: '1px solid var(--border)',
                    borderBottom: '1px solid rgba(42,42,42,0.5)',
                    position: 'relative',
                  }} />
                ))}
              </div>
            ))}

            {/* Current time line */}
            {showNowLine && nowTop > 0 && nowTop < (GRID_END - GRID_START) * hourHeight && (
              <div style={{
                position: 'absolute',
                top: `${nowTop}px`,
                left: '52px',
                right: 0,
                height: '2px',
                background: 'var(--red)',
                zIndex: 10,
                pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute',
                  left: '-5px',
                  top: '-4px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'var(--red)',
                }} />
              </div>
            )}

            {/* Event blocks */}
            {weekDays.map((d, di) => {
              const key = toDateKey(d.toISOString())
              const dayEvs = timedEventsByDay[key] || []
              return dayEvs.map(ev => {
                const startMin = isoToMinutes(ev.start)
                const endMin = isoToMinutes(ev.end)
                const top = ((startMin - GRID_START * 60) / 60) * hourHeight
                const height = Math.max(((endMin - startMin) / 60) * hourHeight, 18)
                const color = calendarColor(ev.calendar)
                // Grid has 8 columns: 52px gutter + 7 equal day columns.
                // Each day column = (100% - 52px) / 7.
                // Event left = 52px gutter + di * column_width + 2px padding.
                return (
                  <div
                    key={ev.id}
                    title={`${ev.title}\n${formatTime(ev.start)} – ${formatTime(ev.end)}`}
                    style={{
                      position: 'absolute',
                      top: `${top}px`,
                      left: `calc(52px + (100% - 52px) * ${di} / 7 + 2px)`,
                      width: `calc((100% - 52px) / 7 - 4px)`,
                      height: `${height}px`,
                      background: color + '25',
                      border: `1px solid ${color}66`,
                      borderLeft: `3px solid ${color}`,
                      borderRadius: '6px',
                      padding: '2px 4px',
                      overflow: 'hidden',
                      zIndex: 5,
                      cursor: 'default',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {ev.title}
                    </div>
                    {height > 28 && (
                      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '1px' }}>
                        {formatTime(ev.start)}
                      </div>
                    )}
                  </div>
                )
              })
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MONTH VIEW
  // ─────────────────────────────────────────────────────────────────────────────

  function MonthView() {
    const year = anchor.getFullYear()
    const month = anchor.getMonth()
    const firstDow = new Date(year, month, 1).getDay() // 0=Sun
    // Convert Sun-start to Mon-start offset
    const offset = firstDow === 0 ? 6 : firstDow - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = [
      ...Array(offset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ]

    const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

    return (
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, padding: '20px', minWidth: 0 }}>
          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', paddingBottom: '6px' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
            {cells.map((day, idx) => {
              if (day === null) return <div key={`blank-${idx}`} />
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayEvents = eventsByDate[dateKey] || []
              const isToday = dateKey === todayKey
              const isSelected = dateKey === selectedDate

              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                  style={{
                    background: isSelected
                      ? 'rgba(155, 132, 236, 0.18)'
                      : isToday
                        ? 'rgba(155, 132, 236, 0.08)'
                        : 'transparent',
                    border: isSelected
                      ? '1px solid rgba(155, 132, 236, 0.4)'
                      : isToday
                        ? '1px solid rgba(155, 132, 236, 0.25)'
                        : '1px solid transparent',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    padding: '6px 4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '3px',
                    minHeight: '60px',
                    transition: 'all 0.1s',
                  }}
                >
                  <span style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: isToday ? 700 : 400,
                    background: isToday ? 'var(--accent)' : 'transparent',
                    color: isToday ? '#fff' : 'var(--text-secondary)',
                    flexShrink: 0,
                  }}>
                    {day}
                  </span>
                  {/* Event pills/dots */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center', width: '100%', padding: '0 2px' }}>
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <div
                        key={i}
                        title={ev.title}
                        style={{
                          height: '5px', width: '5px', borderRadius: '50%',
                          background: calendarColor(ev.calendar),
                          flexShrink: 0,
                        }}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span style={{ fontSize: '8px', color: 'var(--text-muted)', lineHeight: 1 }}>+{dayEvents.length - 3}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Legend */}
          {events.length > 0 && (
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {[...new Set(events.map(e => e.calendar))].map(cal => (
                <div key={cal} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: calendarColor(cal), flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cal}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side panel */}
        {selectedDate && (
          <div className="card" style={{ width: '260px', flexShrink: 0, padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                  {parseLocalDate(selectedDate).toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })}
                </div>
                <button
                  onClick={() => switchToWeek(selectedDate)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', color: 'var(--accent)', marginTop: '2px' }}
                >
                  View week →
                </button>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px' }}
              >
                <X size={14} />
              </button>
            </div>

            {selectedEvents.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No events</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedEvents.map(ev => (
                  <div key={ev.id} style={{
                    padding: '10px 12px',
                    background: 'var(--bg-base)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${calendarColor(ev.calendar)}`,
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{ev.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {ev.allDay ? 'All day' : `${formatTime(ev.start)} – ${formatTime(ev.end)}`}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{ev.calendar}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Calendar</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button onClick={goPrev} style={btnStyle}><ChevronLeft size={14} /></button>
            <button onClick={goNext} style={btnStyle}><ChevronRight size={14} /></button>
            <button onClick={goToday} style={{ ...btnStyle, marginLeft: '4px', fontSize: '12px', padding: '5px 12px' }}>Today</button>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '180px' }}>
            {headerLabel()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!loading && !missingCreds && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginRight: '8px' }}>
              {events.length} events
            </span>
          )}
          <button onClick={() => { setView('week'); setAnchor(weekStart(anchor)) }} style={view === 'week' ? activeTabStyle : btnStyle}>
            Week
          </button>
          <button onClick={() => { setView('month'); setSelectedDate(null) }} style={view === 'month' ? activeTabStyle : btnStyle}>
            Month
          </button>
        </div>
      </div>

      {/* Missing credentials */}
      {missingCreds && (
        <div style={{
          marginBottom: '20px', padding: '20px 24px',
          background: 'rgba(155, 132, 236, 0.08)',
          border: '1px solid rgba(155, 132, 236, 0.25)',
          borderRadius: '12px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <CalendarDays size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--accent-bright)' }}>Connect your iCloud Calendar</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Add the following to <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>.env.local</code> and restart:
          </p>
          <pre style={{ margin: '12px 0 10px', padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)', overflowX: 'auto' }}>
{`CALDAV_URL=https://caldav.icloud.com
CALDAV_USERNAME=your@icloud.com
CALDAV_PASSWORD=xxxx-xxxx-xxxx-xxxx`}
          </pre>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Use an app-specific password from <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>appleid.apple.com</span> → Sign-In & Security → App-Specific Passwords.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'rgba(237, 66, 69, 0.08)', border: '1px solid rgba(237, 66, 69, 0.25)', borderRadius: '8px', fontSize: '13px', color: 'var(--red-bright)', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Loading calendar…
        </div>
      ) : (
        <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: view === 'week' ? 'hidden' : 'auto' }}>
          {view === 'week' ? <WeekView /> : <MonthView />}
        </div>
      )}
    </div>
  )
}
