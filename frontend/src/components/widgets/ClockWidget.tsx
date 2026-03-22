import React, { useState, useEffect } from 'react'
import type { WidgetProps } from '@/lib/widget-registry'

function formatTime(date: Date, format: '12h' | '24h', showSeconds: boolean): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const s = date.getSeconds()

  if (format === '24h') {
    const parts = [
      String(h).padStart(2, '0'),
      String(m).padStart(2, '0'),
    ]
    if (showSeconds) parts.push(String(s).padStart(2, '0'))
    return parts.join(':')
  }

  const h12 = h % 12 || 12
  const parts = [
    String(h12).padStart(2, '0'),
    String(m).padStart(2, '0'),
  ]
  if (showSeconds) parts.push(String(s).padStart(2, '0'))
  return parts.join(':')
}

function formatAmPm(date: Date): string {
  return date.getHours() >= 12 ? 'PM' : 'AM'
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export const ClockWidget = React.memo(function ClockWidget({ config }: WidgetProps) {
  const [now, setNow] = useState(() => new Date())

  const format = (config.format as '12h' | '24h') ?? '12h'
  const showSeconds = config.showSeconds !== undefined ? Boolean(config.showSeconds) : true
  const showDate = config.showDate !== undefined ? Boolean(config.showDate) : true

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const timeStr = formatTime(now, format, showSeconds)
  const amPm = format === '12h' ? formatAmPm(now) : null
  const dateStr = formatDate(now)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '16px',
      gap: '4px',
    }}>
      {/* Time display */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <time
          aria-label={`Current time: ${timeStr}${amPm ? ` ${amPm}` : ''}`}
          aria-live="polite"
          style={{
            fontSize: '32px',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-primary)',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {timeStr}
        </time>
        {amPm && (
          <span style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}>
            {amPm}
          </span>
        )}
      </div>

      {/* Date display */}
      {showDate && (
        <span style={{
          fontSize: '13px',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          {dateStr}
        </span>
      )}
    </div>
  )
})
