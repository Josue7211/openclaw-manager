// Copied/adapted from T3 Code apps/web/src/components/ThreadTerminalDrawer.tsx.
// This keeps the terminal as a resizable bottom dock. ClawControl supplies the
// local terminal hook/websocket backend at the adapter boundary.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowClockwise, Square, X, Terminal } from '@phosphor-icons/react'
import { useTerminal } from '@/hooks/useTerminal'

export interface ThreadTerminalStatusSnapshot {
  title: string
  status: string
  displayText: string
  cwd: string | null
  processId: string | null
  error: string | null
}

interface ThreadTerminalDrawerProps {
  initialCommand?: string
  cwd?: string
  processId?: string
  env?: Record<string, string | number | boolean | null | undefined>
  title?: string
  onClose: () => void
  onStatusChange?: (status: ThreadTerminalStatusSnapshot) => void
}

export const MIN_THREAD_TERMINAL_DOCK_HEIGHT = 180
export const DEFAULT_THREAD_TERMINAL_DOCK_HEIGHT = 260
const MAX_DRAWER_HEIGHT_RATIO = 0.75

export function maxThreadTerminalDockHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_THREAD_TERMINAL_DOCK_HEIGHT
  return Math.max(MIN_THREAD_TERMINAL_DOCK_HEIGHT, Math.floor(window.innerHeight * MAX_DRAWER_HEIGHT_RATIO))
}

export function clampThreadTerminalDockHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THREAD_TERMINAL_DOCK_HEIGHT
  return Math.min(
    Math.max(Math.round(value), MIN_THREAD_TERMINAL_DOCK_HEIGHT),
    maxThreadTerminalDockHeight(),
  )
}

export default function ThreadTerminalDrawer({
  initialCommand,
  cwd,
  processId,
  env,
  title,
  onClose,
  onStatusChange,
}: ThreadTerminalDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(DEFAULT_THREAD_TERMINAL_DOCK_HEIGHT)
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null)
  const {
    error,
    status,
    processId: resolvedProcessId,
    cwd: resolvedCwd,
    exitCode,
    exitSignal,
    closeReason,
    stop,
    restart,
  } = useTerminal(containerRef, {
    fontSize: 12,
    initialCommand,
    cwd,
    processId,
    env,
  })
  const finalStatus = status === 'closed'
    ? closeReason === 'terminated'
      ? 'terminated'
      : exitCode !== null
        ? `exited ${exitCode}`
        : exitSignal !== null
          ? `signal ${exitSignal}`
          : 'closed'
    : status
  const statusText = error || finalStatus
  const stopDisabled = status === 'stopped' || status === 'closed' || status === 'error'

  useEffect(() => {
    onStatusChange?.({
      title: title || 'Terminal',
      status: error ? 'error' : finalStatus,
      displayText: statusText,
      cwd: resolvedCwd,
      processId: resolvedProcessId,
      error,
    })
  }, [error, finalStatus, onStatusChange, resolvedCwd, resolvedProcessId, statusText, title])

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartRef.current = { y: event.clientY, height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start) return
    setHeight(clampThreadTerminalDockHeight(start.height + (start.y - event.clientY)))
  }

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }

  return (
    <section
      className="chat-terminal-drawer thread-terminal-drawer"
      aria-label="Chat terminal"
      style={{
        height,
        minHeight: MIN_THREAD_TERMINAL_DOCK_HEIGHT,
        flexShrink: 0,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--bg-card)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
      }}
    >
      <div
        role="separator"
        aria-label="Resize terminal dock"
        aria-orientation="horizontal"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        style={{
          height: 7,
          flexShrink: 0,
          cursor: 'ns-resize',
          background: 'color-mix(in srgb, var(--border) 45%, transparent)',
        }}
      />
      <div className="chat-terminal-header" style={{
        height: 34,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '0 10px',
        borderBottom: '1px solid var(--border)',
        color: 'var(--text-secondary)',
        fontSize: 12,
      }}>
        <div className="chat-terminal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Terminal size={15} />
          <span className="chat-terminal-name" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{title || 'Terminal'}</span>
          <span className="chat-terminal-status" style={{ color: error ? 'var(--red)' : status === 'running' ? 'var(--secondary)' : 'var(--text-muted)' }}>
            {statusText}
          </span>
          {resolvedCwd ? (
            <span
              className="chat-terminal-cwd"
              title={resolvedCwd}
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--text-muted)',
              }}
            >
              {resolvedCwd}
            </span>
          ) : null}
        </div>
        <div className="chat-terminal-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <TerminalDrawerButton
            label="Stop terminal session"
            onClick={stop}
            disabled={stopDisabled}
            tone="danger"
          >
            <Square size={11} weight="fill" />
          </TerminalDrawerButton>
          <TerminalDrawerButton label="Restart terminal session" onClick={restart}>
            <ArrowClockwise size={14} />
          </TerminalDrawerButton>
          <TerminalDrawerButton label="Close terminal" onClick={onClose}>
            <X size={14} />
          </TerminalDrawerButton>
        </div>
      </div>
      <div
        ref={containerRef}
        className="terminal-container"
        style={{
          flex: 1,
          minHeight: 0,
          background: 'var(--terminal-bg, #0b0b0f)',
          padding: 8,
        }}
      />
    </section>
  )
}

function TerminalDrawerButton({
  label,
  onClick,
  disabled,
  tone = 'neutral',
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'neutral' | 'danger'
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="hover-bg"
      style={{
        width: 26,
        height: 26,
        border: '1px solid var(--border)',
        borderRadius: 7,
        background: tone === 'danger' && !disabled ? 'var(--red-a8, rgba(239, 68, 68, 0.12))' : 'transparent',
        color: tone === 'danger' && !disabled ? 'var(--red-500, #ef4444)' : 'var(--text-muted)',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}
