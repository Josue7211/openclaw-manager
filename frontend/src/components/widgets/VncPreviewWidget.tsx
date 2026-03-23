import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export const VncPreviewWidget = React.memo(function VncPreviewWidget() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: queryKeys.vncStatus,
    queryFn: () => api.get<{ active: number; max: number; available: boolean }>('/api/vnc/status'),
    refetchInterval: 30_000,
  })

  const isConnected = (data?.active ?? 0) > 0

  return (
    <button
      onClick={() => navigate('/remote')}
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
      aria-label="Open Remote Viewer page"
    >
      <div style={{
        width: 36,
        height: 24,
        borderRadius: 4,
        border: `2px solid ${isConnected ? 'var(--green-400)' : 'var(--border)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isConnected ? 'var(--green-400)' : 'var(--text-tertiary)',
        }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {isConnected ? 'VM Connected' : 'Remote Desktop'}
      </span>
    </button>
  )
})
