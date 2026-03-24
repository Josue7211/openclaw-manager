import React from 'react'
import { useGatewayStatus } from '@/hooks/sessions/useGatewayStatus'
import { GATEWAY_STATUS_COLORS, GATEWAY_STATUS_LABELS } from '@/pages/sessions/types'

interface GatewayStatusDotProps {
  /** Show the text label next to the dot. Defaults to false. */
  showLabel?: boolean
  /** Size of the dot in px. Defaults to 8. */
  size?: number
}

/**
 * Small status indicator for the OpenClaw Gateway WebSocket connection.
 * Green = connected, red = disconnected, gray = not configured.
 */
export const GatewayStatusDot = React.memo(function GatewayStatusDot({
  showLabel = false,
  size = 8,
}: GatewayStatusDotProps) {
  const { status, isLoading } = useGatewayStatus()

  if (isLoading) return null

  const color = GATEWAY_STATUS_COLORS[status]
  const label = GATEWAY_STATUS_LABELS[status]

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
          animation: status === 'connected'
            ? 'none'
            : status === 'disconnected'
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
