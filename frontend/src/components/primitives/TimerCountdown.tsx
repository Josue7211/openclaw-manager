/**
 * TimerCountdown primitive -- counts up or down with start/pause/reset controls.
 *
 * Config keys: duration (number, seconds), direction ("down"|"up"),
 *              autoStart (boolean), showMilliseconds (boolean), title (string)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, ArrowCounterClockwise } from '@phosphor-icons/react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { configNumber, configString, configBool } from './shared'

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: '' },
    { key: 'duration', label: 'Duration (seconds)', type: 'number', default: 60, min: 1, max: 86400 },
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      default: 'down',
      options: [
        { label: 'Count Down', value: 'down' },
        { label: 'Count Up', value: 'up' },
      ],
    },
    { key: 'autoStart', label: 'Auto Start', type: 'toggle', default: false },
    { key: 'showMilliseconds', label: 'Show Milliseconds', type: 'toggle', default: false },
  ],
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatTime(ms: number, showMs: boolean): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (n: number) => String(n).padStart(2, '0')

  let result = hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`

  if (showMs) {
    const centiseconds = Math.floor((ms % 1000) / 10)
    result += `.${String(centiseconds).padStart(2, '0')}`
  }

  return result
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TimerCountdown = React.memo(function TimerCountdown({ config }: WidgetProps) {
  const title = configString(config, 'title', '')
  const duration = configNumber(config, 'duration', 60)
  const direction = configString(config, 'direction', 'down')
  const autoStart = configBool(config, 'autoStart', false)
  const showMilliseconds = configBool(config, 'showMilliseconds', false)

  const durationMs = duration * 1000

  const [elapsed, setElapsed] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)

  const isComplete = direction === 'down' && elapsed >= durationMs

  const displayMs = direction === 'down'
    ? Math.max(0, durationMs - elapsed)
    : elapsed

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  // Auto-start
  useEffect(() => {
    if (autoStart && !isRunning && elapsed === 0) {
      startTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startTimer = useCallback(() => {
    if (isComplete) return
    lastTickRef.current = Date.now()
    intervalRef.current = window.setInterval(() => {
      const now = Date.now()
      const delta = now - lastTickRef.current
      lastTickRef.current = now

      setElapsed(prev => {
        const next = prev + delta
        if (direction === 'down' && next >= durationMs) {
          // Timer complete
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          setIsRunning(false)
          return durationMs
        }
        return next
      })
    }, showMilliseconds ? 50 : 1000)
    setIsRunning(true)
  }, [direction, durationMs, isComplete, showMilliseconds])

  const pauseTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsRunning(false)
  }, [])

  const resetTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setElapsed(0)
    setIsRunning(false)
  }, [])

  const buttonStyle: React.CSSProperties = {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '12px',
        padding: '16px',
      }}
    >
      {title && (
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {title}
        </span>
      )}

      <span
        style={{
          fontSize: '48px',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: isComplete ? 'var(--accent)' : 'var(--text-primary)',
          lineHeight: 1,
          transition: 'color 0.3s',
        }}
      >
        {formatTime(displayMs, showMilliseconds)}
      </span>

      <div style={{ display: 'flex', gap: '8px' }}>
        {isRunning ? (
          <button
            type="button"
            onClick={pauseTimer}
            aria-label="Pause"
            className="hover-bg"
            style={buttonStyle}
          >
            <Pause size={20} weight="fill" />
          </button>
        ) : (
          <button
            type="button"
            onClick={startTimer}
            aria-label="Play"
            className="hover-bg"
            style={buttonStyle}
            disabled={isComplete}
          >
            <Play size={20} weight="fill" />
          </button>
        )}
        <button
          type="button"
          onClick={resetTimer}
          aria-label="Reset"
          className="hover-bg"
          style={buttonStyle}
        >
          <ArrowCounterClockwise size={20} />
        </button>
      </div>
    </div>
  )
})

export default TimerCountdown
