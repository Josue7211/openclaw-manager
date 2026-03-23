import { useState, useEffect, useRef, useCallback } from 'react'

interface VncToolbarProps {
  connected: boolean
  onDisconnect: () => void
  onReconnect: () => void
  onPasteClipboard: () => void
  onToggleScale: () => void
  onFullscreen: () => void
  scale: 'fit' | 'native'
  quality: number
  onQualityChange: (q: number) => void
}

const QUALITY_OPTIONS = [
  { label: 'Low', value: 2 },
  { label: 'Medium', value: 5 },
  { label: 'High', value: 8 },
]

export function VncToolbar({
  connected,
  onDisconnect,
  onReconnect,
  onPasteClipboard,
  onToggleScale,
  onFullscreen,
  scale,
  quality,
  onQualityChange,
}: VncToolbarProps) {
  const [visible, setVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setVisible(false), 3000)
  }, [])

  // Start auto-hide timer on mount and when visible becomes true
  useEffect(() => {
    if (visible) resetHideTimer()
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [visible, resetHideTimer])

  // Expose show/resetTimer for parent mouse handler
  useEffect(() => {
    const handler = () => {
      setVisible(true)
      resetHideTimer()
    }
    window.addEventListener('vnc-toolbar-show', handler)
    return () => window.removeEventListener('vnc-toolbar-show', handler)
  }, [resetHideTimer])

  // Status dot color
  const statusColor = connected ? 'var(--green-400)' : 'var(--red-500)'
  const statusLabel = connected ? 'Connected' : 'Disconnected'

  return (
    <div
      role="toolbar"
      aria-label="VNC controls"
      onMouseEnter={() => {
        setVisible(true)
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      }}
      onMouseLeave={resetHideTimer}
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: visible
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(-20px)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--bg-elevated)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Status dot */}
      <div
        aria-label={statusLabel}
        title={statusLabel}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
        }}
      />

      {/* Disconnect / Reconnect */}
      {connected ? (
        <button
          onClick={onDisconnect}
          aria-label="Disconnect VNC"
          style={buttonStyle}
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={onReconnect}
          aria-label="Reconnect VNC"
          style={buttonStyle}
        >
          Reconnect
        </button>
      )}

      <Divider />

      {/* Paste clipboard */}
      <button
        onClick={onPasteClipboard}
        aria-label="Paste clipboard to remote"
        title="Paste clipboard"
        style={buttonStyle}
      >
        <ClipboardIcon />
      </button>

      {/* Scale toggle */}
      <button
        onClick={onToggleScale}
        aria-label={scale === 'fit' ? 'Switch to native 1:1 scale' : 'Switch to fit scale'}
        title={scale === 'fit' ? 'Native 1:1' : 'Fit to window'}
        style={buttonStyle}
      >
        {scale === 'fit' ? '1:1' : 'Fit'}
      </button>

      {/* Quality dropdown */}
      <select
        value={quality}
        onChange={(e) => onQualityChange(Number(e.target.value))}
        aria-label="VNC quality"
        style={{
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '3px 6px',
          fontSize: 12,
          cursor: 'pointer',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      >
        {QUALITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <Divider />

      {/* Fullscreen */}
      <button
        onClick={onFullscreen}
        aria-label="Enter fullscreen"
        title="Fullscreen"
        style={buttonStyle}
      >
        <ExpandIcon />
      </button>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 16,
        background: 'var(--border)',
        flexShrink: 0,
      }}
    />
  )
}

function ClipboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}
