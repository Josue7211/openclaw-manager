import { useRef, useEffect } from 'react'
import { formatHour } from '@/lib/utils'
import {
  CalendarEvent, calendarColor, toDateKey, formatTime, addDays,
  isoToMinutes, GRID_START, GRID_END, DAY_LABELS,
} from './shared'

interface WeekViewProps {
  anchor: Date
  events: CalendarEvent[]
  todayKey: string
  hourHeight: number
  scrollRef: React.RefObject<HTMLDivElement | null>
}

export function WeekView({ anchor, events, todayKey, hourHeight, scrollRef }: WeekViewProps) {
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
  const hours = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i)

  // Partition events for the visible week
  const allDayEvents: CalendarEvent[] = []
  const timedEventsByDay: Record<string, CalendarEvent[]> = {}

  for (const ev of events) {
    const key = toDateKey(ev.start)
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
                color: isToday ? 'var(--text-on-color)' : 'var(--text-primary)',
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
          <div style={{ padding: '4px 6px 4px', fontSize: '9px', color: 'var(--text-muted)', textAlign: 'right', alignSelf: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>all-day</div>
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
                  borderBottom: '1px solid var(--border-strong)',
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
