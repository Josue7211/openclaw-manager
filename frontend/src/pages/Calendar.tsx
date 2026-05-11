import { useState, useRef, useEffect } from 'react'
import { CalendarDots, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { ErrorState } from '@/components/ui/ErrorState'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { PageHeader } from '@/components/PageHeader'
import {
  CalendarEvent,
  CalendarResponse,
  toDateKey,
  weekStart,
  addDays,
  addMonths,
  parseLocalDate,
  MONTH_NAMES,
  GRID_START,
  GRID_END,
} from './calendar/shared'
import { WeekView } from './calendar/WeekView'
import { MonthView } from './calendar/MonthView'
import { EventDetails, CalendarEventUpdate } from './calendar/EventDetails'

function eventDeleteKey(event: CalendarEvent): string {
  return [
    event.objectUrl || '',
    String(event.id ?? ''),
    event.title || '',
    event.start || '',
    event.end || '',
    event.calendar || '',
  ].join('|')
}

function inputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function inputDateTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time || '09:00'}`).toISOString()
}

export default function CalendarPage() {
  const demo = isDemoMode()
  const {
    data: calendarData,
    isLoading: loading,
    refetch,
  } = useTauriQuery<CalendarResponse>(['calendar'], '/api/calendar', { enabled: !demo })

  const rawEvents = calendarData?.events ?? []
  const missingCreds = calendarData?.error === 'missing_credentials'
  const error =
    calendarData?.error && calendarData.error !== 'missing_credentials'
      ? calendarData.message || 'Failed to load calendar'
      : null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState<Date>(() => weekStart(today))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newEvent, setNewEvent] = useState(() => ({
    title: '',
    date: inputDate(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    calendar: '',
    allDay: false,
  }))
  const [deletedEventKeys, setDeletedEventKeys] = useState<Set<string>>(() => new Set())

  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hourHeight, setHourHeight] = useState(56)

  const deleteMutation = useMutation({
    mutationFn: async (event: CalendarEvent) => {
      await api.del('/api/calendar', {
        id: String(event.id ?? ''),
        objectUrl: event.objectUrl || null,
        localId: event.localId ?? null,
        appleEventId: event.appleEventId || null,
        title: event.title,
        start: event.start,
        end: event.end,
        calendar: event.calendar,
      })
    },
    onSuccess: async (_data, event) => {
      const next = new Set(deletedEventKeys)
      next.add(eventDeleteKey(event))
      setDeletedEventKeys(next)
      setDeleteError(null)
      setSelectedEvent(null)
      await refetch()
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const start = newEvent.allDay
        ? new Date(`${newEvent.date}T00:00`).toISOString()
        : inputDateTimeToIso(newEvent.date, newEvent.startTime)
      const end = newEvent.allDay
        ? new Date(new Date(`${newEvent.date}T00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : inputDateTimeToIso(newEvent.date, newEvent.endTime)
      await api.post('/api/calendar', {
        title: newEvent.title.trim(),
        start,
        end,
        allDay: newEvent.allDay,
        calendar: newEvent.calendar.trim() || null,
      })
    },
    onSuccess: async () => {
      setCreateError(null)
      setShowCreate(false)
      setNewEvent(form => ({ ...form, title: '' }))
      await refetch()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ event, updates }: { event: CalendarEvent; updates: CalendarEventUpdate }) => {
      await api.patch('/api/calendar', {
        id: String(event.id ?? ''),
        appleEventId: event.appleEventId || null,
        title: updates.title,
        start: updates.start,
        end: updates.end,
        allDay: updates.allDay,
        calendar: updates.calendar,
      })
    },
    onSuccess: async () => {
      setDeleteError(null)
      setSelectedEvent(null)
      await refetch()
    },
  })

  async function deleteSelectedEvent(event: CalendarEvent) {
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(event)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete calendar event')
    }
  }

  async function createEvent() {
    setCreateError(null)
    if (!newEvent.title.trim()) {
      setCreateError('Title required')
      return
    }
    if (!newEvent.allDay && newEvent.endTime <= newEvent.startTime) {
      setCreateError('End time must be after start time')
      return
    }
    try {
      await createMutation.mutateAsync()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create calendar event')
    }
  }

  async function updateSelectedEvent(event: CalendarEvent, updates: CalendarEventUpdate) {
    setDeleteError(null)
    if (!updates.title.trim()) {
      setDeleteError('Title required')
      return
    }
    if (!updates.allDay && new Date(updates.end) <= new Date(updates.start)) {
      setDeleteError('End time must be after start time')
      return
    }
    try {
      await updateMutation.mutateAsync({ event, updates })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not update calendar event')
    }
  }

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
  const events = rawEvents.filter(ev => !deletedEventKeys.has(eventDeleteKey(ev)))
  const calendarNames = [...new Set(events.map(event => event.calendar).filter(Boolean))].sort()

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

  const inputStyle: React.CSSProperties = {
    minWidth: 0,
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
    padding: '7px 9px',
    fontSize: '12px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0' }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <PageHeader defaultTitle="Calendar" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button onClick={goPrev} aria-label="Previous" style={btnStyle}>
              <CaretLeft size={14} />
            </button>
            <button onClick={goNext} aria-label="Next" style={btnStyle}>
              <CaretRight size={14} />
            </button>
            <button onClick={goToday} style={{ ...btnStyle, marginLeft: '4px', fontSize: '12px', padding: '5px 12px' }}>
              Today
            </button>
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
          <button
            onClick={() => {
              setShowCreate(open => !open)
              setCreateError(null)
            }}
            style={showCreate ? activeTabStyle : btnStyle}
          >
            +
          </button>
          <button
            onClick={() => {
              setView('week')
              setAnchor(weekStart(anchor))
            }}
            style={view === 'week' ? activeTabStyle : btnStyle}
          >
            Week
          </button>
          <button
            onClick={() => {
              setView('month')
              setSelectedDate(null)
            }}
            style={view === 'month' ? activeTabStyle : btnStyle}
          >
            Month
          </button>
        </div>
      </div>

      {/* Demo mode */}
      {demo && (
        <div
          style={{
            marginBottom: '20px',
            padding: '20px 24px',
            background: 'var(--purple-a08)',
            border: '1px solid var(--border-accent)',
            borderRadius: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <CalendarDots size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--accent-bright)' }}>
              Calendar not configured
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Connect your iCloud Calendar in Settings to see events here.
          </p>
        </div>
      )}

      {/* Missing credentials */}
      {!demo && missingCreds && (
        <div
          style={{
            marginBottom: '20px',
            padding: '20px 24px',
            background: 'var(--purple-a08)',
            border: '1px solid var(--border-accent)',
            borderRadius: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <CalendarDots size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--accent-bright)' }}>
              Connect your iCloud Calendar
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Add the following to{' '}
            <code
              style={{
                background: 'var(--bg-elevated)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              .env.local
            </code>{' '}
            and restart:
          </p>
          <pre
            style={{
              margin: '12px 0 10px',
              padding: '12px 16px',
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
              overflowX: 'auto',
            }}
          >
            {`CALDAV_URL=https://caldav.icloud.com
CALDAV_USERNAME=your@icloud.com
CALDAV_PASSWORD=xxxx-xxxx-xxxx-xxxx`}
          </pre>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Use an app-specific password from{' '}
            <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>appleid.apple.com</span> → Sign-In &
            Security → App-Specific Passwords.
          </p>
        </div>
      )}

      {/* Error */}
      {error && <ErrorState resource="calendar" onRetry={() => refetch()} />}
      {showCreate && (
        <div
          style={{
            marginBottom: '12px',
            padding: '12px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-elevated)',
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) 140px 90px 90px minmax(130px, 170px) auto auto',
            gap: '8px',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <input
            value={newEvent.title}
            onChange={event => setNewEvent(form => ({ ...form, title: event.target.value }))}
            placeholder="Event title"
            style={inputStyle}
          />
          <input
            type="date"
            value={newEvent.date}
            onChange={event => setNewEvent(form => ({ ...form, date: event.target.value }))}
            style={inputStyle}
          />
          <input
            type="time"
            value={newEvent.startTime}
            disabled={newEvent.allDay}
            onChange={event => setNewEvent(form => ({ ...form, startTime: event.target.value }))}
            style={inputStyle}
          />
          <input
            type="time"
            value={newEvent.endTime}
            disabled={newEvent.allDay}
            onChange={event => setNewEvent(form => ({ ...form, endTime: event.target.value }))}
            style={inputStyle}
          />
          <select
            value={newEvent.calendar}
            onChange={event => setNewEvent(form => ({ ...form, calendar: event.target.value }))}
            style={inputStyle}
          >
            <option value="">Default calendar</option>
            {calendarNames.map(calendar => (
              <option key={calendar} value={calendar}>
                {calendar}
              </option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={newEvent.allDay}
              onChange={event => setNewEvent(form => ({ ...form, allDay: event.target.checked }))}
            />
            All day
          </label>
          <button
            onClick={createEvent}
            disabled={createMutation.isPending}
            style={createMutation.isPending ? { ...activeTabStyle, opacity: 0.6 } : activeTabStyle}
          >
            {createMutation.isPending ? 'Adding' : 'Add'}
          </button>
          {createError && (
            <div style={{ gridColumn: '1 / -1', color: 'var(--red)', fontSize: '12px' }}>{createError}</div>
          )}
        </div>
      )}
      {deleteError && (
        <div style={{
          marginBottom: '12px',
          padding: '10px 12px',
          border: '1px solid var(--red-500-a20)',
          borderRadius: '8px',
          background: 'var(--red-500-a12)',
          color: 'var(--red)',
          fontSize: '12px',
          flexShrink: 0,
        }}>
          {deleteError}
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
              onEventSelect={setSelectedEvent}
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
              onEventSelect={setSelectedEvent}
            />
          )}
        </div>
      )}
      <EventDetails
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onDelete={deleteSelectedEvent}
        onUpdate={updateSelectedEvent}
        deleting={deleteMutation.isPending}
        updating={updateMutation.isPending}
      />
    </div>
  )
}
