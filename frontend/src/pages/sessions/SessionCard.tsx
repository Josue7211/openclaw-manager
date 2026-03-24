import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X } from '@phosphor-icons/react'
import type { ClaudeSession } from './types'
import { STATUS_COLORS, STATUS_LABELS } from './types'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

interface SessionCardProps {
  session: ClaudeSession
  selected: boolean
  onSelect: () => void
  onKill: (id: string) => void
  available: boolean
  isKilling: boolean
}

export const SessionCard = React.memo(function SessionCard({
  session,
  selected,
  onSelect,
  onKill,
  available,
  isKilling,
}: SessionCardProps) {
  const [confirmingKill, setConfirmingKill] = useState(false)
  const [liveDuration, setLiveDuration] = useState<number | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live-updating duration for running sessions without a set duration
  useEffect(() => {
    if (session.duration != null || !session.startedAt) {
      setLiveDuration(null)
      return
    }
    const startMs = new Date(session.startedAt).getTime()
    const tick = () => setLiveDuration(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [session.duration, session.startedAt])

  // Clear confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const handleKillClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmingKill) {
      onKill(session.id)
      setConfirmingKill(false)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    } else {
      setConfirmingKill(true)
      confirmTimer.current = setTimeout(() => setConfirmingKill(false), 3000)
    }
  }, [confirmingKill, onKill, session.id])

  const showKill = session.status === 'running'
  const statusColor = STATUS_COLORS[session.status] || STATUS_COLORS.unknown
  const statusLabel = STATUS_LABELS[session.status] || STATUS_LABELS.unknown
  const durationValue = session.duration ?? liveDuration

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        background: selected ? 'var(--active-bg)' : 'var(--bg-card)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: `1px solid ${selected ? 'var(--accent)44' : 'var(--border)'}`,
        borderRadius: '16px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'border-color 0.3s, background 0.15s',
        fontFamily: 'inherit',
        color: 'inherit',
        position: 'relative',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Task title */}
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '6px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {session.task}
        </div>

        {/* Status + model badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColor,
              animation: session.status === 'running' ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: statusColor,
            }}>
              {statusLabel}
            </span>
          </div>

          {session.model && (
            <span style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              background: 'var(--hover-bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '2px 7px',
            }}>
              {session.model}
            </span>
          )}
        </div>

        {/* Duration */}
        {durationValue != null && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {formatDuration(durationValue)}
          </div>
        )}
      </div>

      {/* Kill button */}
      {showKill && (
        <button
          type="button"
          onClick={handleKillClick}
          disabled={!available || isKilling}
          aria-label={confirmingKill ? 'Confirm kill session' : 'Kill session'}
          title={!available ? 'OpenClaw not connected' : confirmingKill ? 'Click again to confirm' : 'Kill session'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: confirmingKill ? 'auto' : '28px',
            height: '28px',
            borderRadius: '8px',
            border: `1px solid ${confirmingKill ? 'var(--red-500)' : 'var(--border)'}`,
            background: confirmingKill ? 'var(--red-500)22' : 'transparent',
            color: confirmingKill ? 'var(--red-500)' : 'var(--text-muted)',
            cursor: available && !isKilling ? 'pointer' : 'not-allowed',
            opacity: available && !isKilling ? 1 : 0.4,
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            padding: confirmingKill ? '0 10px' : '0',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
          className={available && !isKilling ? 'hover-bg' : undefined}
        >
          {confirmingKill ? 'Kill?' : <X size={14} />}
        </button>
      )}
    </button>
  )
})
