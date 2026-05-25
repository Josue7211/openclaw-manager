import React from 'react'
import { useHarnessStatus } from '@/hooks/useHarnessStatus'
import { useGatewayStatus } from '@/hooks/sessions/useGatewayStatus'

interface GatewayStatusDotProps {
  /** Show the text label next to the dot. Defaults to false. */
  showLabel?: boolean
  /** Size of the dot in px. Defaults to 8. */
  size?: number
}

/**
 * Small status indicator for the active Hermes Agent connection.
 * Combines authenticated Hermes Agent HTTP health with the live gateway
 * WebSocket status used for sessions and event streaming.
 */
export const GatewayStatusDot = React.memo(function GatewayStatusDot({
  showLabel = false,
  size = 8,
}: GatewayStatusDotProps) {
  const harness = useHarnessStatus()
  const gateway = useGatewayStatus()

  if (harness.isLoading || gateway.isLoading) return null

  const providerLabel = harness.providerLabel
  const gatewayStatus = harness.status === 'connected' ? gateway.status : harness.status

  const color = {
    connected: 'var(--green-400)',
    connecting: 'var(--yellow-400, #facc15)',
    reconnecting: 'var(--yellow-400, #facc15)',
    disconnected: 'var(--red-500)',
    not_configured: 'var(--text-muted)',
  }[gatewayStatus]

  const label = {
    connected: `${providerLabel} gateway connected`,
    connecting: `${providerLabel} gateway connecting`,
    reconnecting: `${providerLabel} gateway reconnecting`,
    disconnected: harness.status === 'connected' ? `${providerLabel} gateway offline` : `${providerLabel} offline`,
    not_configured: harness.status === 'connected' ? `${providerLabel} gateway not configured` : `${providerLabel} not configured`,
  }[gatewayStatus]
  const gatewayDetail = harness.status === 'connected'
    ? [
        gateway.protocol ? `Protocol ${gateway.protocol}.` : '',
        gateway.status === 'reconnecting' && gateway.reconnectAttempt > 0
          ? `Reconnect attempt ${gateway.reconnectAttempt}.`
          : '',
      ].filter(Boolean).join(' ')
    : ''
  const detail = harness.status === 'connected'
    ? gatewayDetail
    : harness.detail
  const title = detail ? `${label}. ${detail}` : label

  return (
    <span
      aria-live="polite"
      title={title}
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
          animation: gatewayStatus === 'disconnected' || gatewayStatus === 'reconnecting'
            ? 'pulse-dot 1.5s ease-in-out infinite'
            : 'none',
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
