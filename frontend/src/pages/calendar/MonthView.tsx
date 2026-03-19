import { X, CalendarBlank } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  CalendarEvent, calendarColor, toDateKey, parseLocalDate, formatTime,
  DAY_LABELS,
} from './shared'

interface MonthViewProps {
  anchor: Date
  events: CalendarEvent[]
  eventsByDate: Record<string, CalendarEvent[]>
  todayKey: string
  selectedDate: string | null
  onSelectDate: (dateKey: string | null) => void
  onSwitchToWeek: (dateKey?: string) => void
}

export function MonthView({ anchor, events, eventsByDate, todayKey, selectedDate, onSelectDate, onSwitchToWeek }: MonthViewProps) {
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
                onClick={() => onSelectDate(isSelected ? null : dateKey)}
                style={{
                  background: isSelected
                    ? 'var(--purple-a20)'
                    : isToday
                      ? 'var(--purple-a08)'
                      : 'transparent',
                  border: isSelected
                    ? '1px solid var(--purple-a40)'
                    : isToday
                      ? '1px solid var(--border-accent)'
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
                  color: isToday ? 'var(--text-on-color)' : 'var(--text-secondary)',
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
                onClick={() => onSwitchToWeek(selectedDate)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', color: 'var(--accent)', marginTop: '2px' }}
              >
                View week →
              </button>
            </div>
            <button
              onClick={() => onSelectDate(null)}
              aria-label="Close"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px' }}
            >
              <X size={14} />
            </button>
          </div>

          {selectedEvents.length === 0 ? (
            <div style={{ padding: '8px 0' }}><EmptyState icon={CalendarBlank} title="No events" /></div>
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
