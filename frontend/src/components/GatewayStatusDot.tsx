import React from 'react'
import { useHarnessStatus } from '@/hooks/useHarnessStatus'

interface GatewayStatusDotProps {
  /** Show the text label next to the dot. Defaults to false. */
  showLabel?: boolean
  /** Size of the dot in px. Defaults to 8. */
  size?: number
}

/**
 * Small status indicator for the active harness connection.
 * Works for either OpenClaw or Hermes compat because it reads generic
 * harness HTTP health instead of the unfinished gateway WS status stub.
 */
export const GatewayStatusDot = React.memo(function GatewayStatusDot({
  showLabel = false,
  size = 8,
}: GatewayStatusDotProps) {
  const { status, isLoading, providerLabel } = useHarnessStatus()

  if (isLoading) return null

  const color = {
    connected: 'var(--green-400)',
    disconnected: 'var(--red-500)',
    not_configured: 'var(--text-muted)',
  }[status]

  const label = {
    connected: `${providerLabel} connected`,
    disconnected: `${providerLabel} offline`,
    not_configured: `${providerLabel} not configured`,
  }[status]

  return (
    <span
      aria-live="polite"
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          animation: status === 'disconnected' ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
        }}
      />
      {showLabel && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color,
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
})
