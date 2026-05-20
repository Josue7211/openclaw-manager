import { useEffect, useState } from 'react'
import { CalendarBlank, Clock, FloppyDisk, PencilSimple, Trash, X } from '@phosphor-icons/react'
import { CalendarEvent, calendarColor, formatTime, parseLocalDate } from './shared'

export interface CalendarEventUpdate {
  title: string
  start: string
  end: string
  allDay: boolean
  calendar: string
}

interface EventDetailsProps {
  event: CalendarEvent | null
  onClose: () => void
  onDelete?: (event: CalendarEvent) => void
  onUpdate?: (event: CalendarEvent, updates: CalendarEventUpdate) => void
  deleting?: boolean
  updating?: boolean
}

function formatEventDate(event: CalendarEvent): string {
  const start = parseLocalDate(event.start)
  const end = parseLocalDate(event.end)
  const startDate = start.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })
  const endDate = end.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })

  if (event.allDay || event.start.length === 10) return startDate
  if (start.toDateString() === end.toDateString()) {
    return `${startDate}, ${formatTime(event.start)} - ${formatTime(event.end)}`
  }
  return `${startDate}, ${formatTime(event.start)} - ${endDate}, ${formatTime(event.end)}`
}

function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function EventDetails({
  event,
  onClose,
  onDelete,
  onUpdate,
  deleting = false,
  updating = false,
}: EventDetailsProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    allDay: false,
  })

  useEffect(() => {
    if (!event) return undefined
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [event, onClose])

  useEffect(() => {
    if (!event) return
    const start = parseLocalDate(event.start)
    const end = parseLocalDate(event.end)
    setForm({
      title: event.title || '',
      date: dateInputValue(start),
      startTime: timeInputValue(start),
      endTime: timeInputValue(end),
      allDay: Boolean(event.allDay),
    })
    setEditing(false)
  }, [event])

  if (!event) return null

  const activeEvent = event
  const color = calendarColor(activeEvent.calendar)
  const inputStyle: React.CSSProperties = {
    minWidth: 0,
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
    padding: '7px 9px',
    fontSize: '12px',
  }

  function saveEdit() {
    if (!form.title.trim()) return
    const start = form.allDay
      ? new Date(`${form.date}T00:00`).toISOString()
      : new Date(`${form.date}T${form.startTime || '09:00'}`).toISOString()
    const end = form.allDay
      ? new Date(new Date(`${form.date}T00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : new Date(`${form.date}T${form.endTime || '10:00'}`).toISOString()
    onUpdate?.(activeEvent, {
      title: form.title.trim(),
      start,
      end,
      allDay: form.allDay,
      calendar: activeEvent.calendar,
    })
  }

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Event details"
        onMouseDown={mouseEvent => mouseEvent.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '18px 18px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: color,
              marginTop: '6px',
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            {editing ? (
              <input
                value={form.title}
                onChange={inputEvent => setForm(current => ({ ...current, title: inputEvent.target.value }))}
                style={{ ...inputStyle, width: '100%', fontSize: '14px', fontWeight: 600 }}
              />
            ) : (
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  lineHeight: 1.25,
                  color: 'var(--text-primary)',
                  overflowWrap: 'anywhere',
                }}
              >
                {event.title || 'Untitled event'}
              </h2>
            )}
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{event.calendar}</p>
          </div>
          {onUpdate && (
            <button
              type="button"
              onClick={() => setEditing(value => !value)}
              aria-label="Edit event"
              style={iconButtonStyle}
            >
              <PencilSimple size={14} />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close event details" style={iconButtonStyle}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '16px 18px 18px', display: 'grid', gap: '12px' }}>
          {editing ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              <input
                type="date"
                value={form.date}
                onChange={inputEvent => setForm(current => ({ ...current, date: inputEvent.target.value }))}
                style={inputStyle}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="time"
                  value={form.startTime}
                  disabled={form.allDay}
                  onChange={inputEvent => setForm(current => ({ ...current, startTime: inputEvent.target.value }))}
                  style={inputStyle}
                />
                <input
                  type="time"
                  value={form.endTime}
                  disabled={form.allDay}
                  onChange={inputEvent => setForm(current => ({ ...current, endTime: inputEvent.target.value }))}
                  style={inputStyle}
                />
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={inputEvent => setForm(current => ({ ...current, allDay: inputEvent.target.checked }))}
                />
                All day
              </label>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <Clock size={18} style={{ color: 'var(--text-muted)', marginTop: '1px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                    {formatEventDate(event)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {event.allDay ? 'All day' : 'Scheduled event'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CalendarBlank size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{event.calendar}</div>
              </div>
            </>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              paddingTop: '6px',
              borderTop: '1px solid var(--border)',
            }}
          >
            {editing && onUpdate && (
              <button type="button" onClick={saveEdit} disabled={updating} style={saveButtonStyle}>
                <FloppyDisk size={14} />
                {updating ? 'Saving' : 'Save'}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(event)}
                disabled={deleting}
                style={deleteButtonStyle(deleting)}
              >
                <Trash size={14} />
                Delete
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

const iconButtonStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const saveButtonStyle: React.CSSProperties = {
  border: '1px solid var(--purple-a40)',
  borderRadius: '8px',
  background: 'var(--purple-a15)',
  color: 'var(--accent-bright)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  padding: '8px 11px',
  fontSize: '12px',
  fontWeight: 600,
}

function deleteButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid var(--red-500-a20)',
    borderRadius: '8px',
    background: 'var(--red-500-a12)',
    color: disabled ? 'var(--text-muted)' : 'var(--red)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '8px 11px',
    fontSize: '12px',
    fontWeight: 600,
  }
}
