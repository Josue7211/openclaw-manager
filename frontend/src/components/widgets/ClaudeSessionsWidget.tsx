import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { GatewayStatusDot } from '@/components/GatewayStatusDot'

export const ClaudeSessionsWidget = React.memo(function ClaudeSessionsWidget() {
  const navigate = useNavigate()
  const { sessions } = useGatewaySessions()

  const running = sessions.filter(s => s.status === 'running').length

  return (
    <button
      onClick={() => navigate('/sessions')}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: 'none',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        fontFamily: 'inherit',
        padding: 12,
      }}
      aria-label="Open Claude Sessions page"
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: running > 0 ? 'var(--green-400)' : 'var(--text-secondary)' }}>
          {running}
        </span>
        <GatewayStatusDot size={7} />
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {running === 1 ? 'active session' : 'active sessions'}
      </span>
      {sessions.length > running && (
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {sessions.length} total
        </span>
      )}
    </button>
  )
})
