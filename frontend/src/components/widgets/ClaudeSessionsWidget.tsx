import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

interface SessionListResponse {
  sessions: Array<{ id: string; status: string; task?: string }>
  available: boolean
}

export const ClaudeSessionsWidget = React.memo(function ClaudeSessionsWidget() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: queryKeys.claudeSessions,
    queryFn: () => api.get<SessionListResponse>('/api/claude-sessions'),
    refetchInterval: 10_000,
  })

  const sessions = data?.sessions ?? []
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
      <span style={{ fontSize: 28, fontWeight: 700, color: running > 0 ? 'var(--green-400)' : 'var(--text-secondary)' }}>
        {running}
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
