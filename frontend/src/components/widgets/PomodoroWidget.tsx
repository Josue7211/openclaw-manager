import React from 'react'
import { Play, Pause, ArrowCounterClockwise, ArrowRight, Timer } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { usePomodoroWidget } from '@/lib/hooks/dashboard'
import { MODE_LABELS } from '@/pages/pomodoro/types'
import type { WidgetProps } from '@/lib/widget-registry'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const PomodoroWidget = React.memo(function PomodoroWidget(_props: WidgetProps) {
  const { mode, secondsLeft, running, todayCount, toggle, reset } = usePomodoroWidget()
  const navigate = useNavigate()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '16px',
      gap: '8px',
    }}>
      {/* Mode label */}
      <span style={{
        fontSize: '12px',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        letterSpacing: '0.5px',
        fontWeight: 600,
      }}>
        {MODE_LABELS[mode]}
      </span>

      {/* Timer display */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Running indicator dot */}
        <span
          aria-hidden="true"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: running ? 'var(--green-400)' : 'var(--text-muted)',
            transition: 'background 0.2s var(--ease-spring)',
            flexShrink: 0,
          }}
        />
        <time
          aria-label={`${formatTime(secondsLeft)} remaining`}
          aria-live="polite"
          style={{
            fontSize: '36px',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {formatTime(secondsLeft)}
        </time>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
        {/* Reset button */}
        <button
          onClick={reset}
          aria-label="Reset timer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--bg-white-03)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s var(--ease-spring)',
          }}
          className="hover-bg"
        >
          <ArrowCounterClockwise size={14} weight="bold" />
        </button>

        {/* Play / Pause */}
        <button
          onClick={toggle}
          aria-label={running ? 'Pause timer' : 'Start timer'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--text-on-accent)',
            cursor: 'pointer',
            transition: 'all 0.2s var(--ease-spring)',
          }}
        >
          {running ? (
            <Pause size={18} weight="fill" />
          ) : (
            <Play size={18} weight="fill" />
          )}
        </button>

        {/* Spacer to balance reset button */}
        <div style={{ width: '32px' }} />
      </div>

      {/* Session count */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginTop: '4px',
        fontSize: '11px',
        color: 'var(--text-muted)',
      }}>
        <Timer size={12} />
        <span>{todayCount} session{todayCount !== 1 ? 's' : ''} today</span>
      </div>

      {/* View all link */}
      <button
        onClick={() => navigate('/pomodoro')}
        aria-label="View pomodoro timer page"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginTop: '2px',
          padding: '4px 8px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--accent)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '6px',
          transition: 'all 0.2s var(--ease-spring)',
        }}
        className="hover-bg"
      >
        View all <ArrowRight size={12} />
      </button>
    </div>
  )
})
