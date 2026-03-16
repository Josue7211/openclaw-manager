


import { useState, useRef, useEffect } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'
import {
  CalendarResponse, toDateKey, weekStart, addDays, addMonths,
  parseLocalDate, MONTH_NAMES, GRID_START, GRID_END,
} from './calendar/shared'
import { WeekView } from './calendar/WeekView'
import { MonthView } from './calendar/MonthView'

export default function CalendarPage() {
  const { data: calendarData, isLoading: loading } = useTauriQuery<CalendarResponse>(
    ['calendar'],
    '/api/calendar',
  )

  const events = calendarData?.events ?? []
  const missingCreds = calendarData?.error === 'missing_credentials'
  const error = calendarData?.error && calendarData.error !== 'missing_credentials'
    ? (calendarData.message || 'Failed to load calendar')
    : null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState<Date>(() => weekStart(today))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hourHeight, setHourHeight] = useState(56)

  // Dynamically size hour height to fit viewport
  useEffect(() => {
    function resize() {
      if (!containerRef.current) return
      const top = containerRef.current.getBoundingClientRect().top
      const available = window.innerHeight - top - 16
      const gridAvailable = available - 52
      const computed = Math.max(Math.floor(gridAvailable / (GRID_END - GRID_START)), 28)
      setHourHeight(Math.min(computed, 56))
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [loading, view])

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

  const eventsByDate: Record<string, (typeof events)[number][]> = {}
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
    background: 'var(--purple-a15)',
    border: '1px solid var(--purple-a40)',
    color: 'var(--accent-bright)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <PageHeader defaultTitle="Calendar" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button onClick={goPrev} aria-label="Previous" style={btnStyle}><ChevronLeft size={14} /></button>
            <button onClick={goNext} aria-label="Next" style={btnStyle}><ChevronRight size={14} /></button>
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
          background: 'var(--purple-a08)',
          border: '1px solid var(--border-accent)',
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
          Loading calendar...
        </div>
      ) : (
        <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: view === 'week' ? 'hidden' : 'auto' }}>
          {view === 'week' ? (
            <WeekView
              anchor={anchor}
              events={events}
              todayKey={todayKey}
              hourHeight={hourHeight}
              scrollRef={scrollRef}
            />
          ) : (
            <MonthView
              anchor={anchor}
              events={events}
              eventsByDate={eventsByDate}
              todayKey={todayKey}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onSwitchToWeek={switchToWeek}
            />
          )}
        </div>
      )}
    </div>
  )
}
