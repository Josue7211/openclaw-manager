import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { RemoteViewerStatus } from '@/lib/remote-viewer'

export const VncPreviewWidget = React.memo(function VncPreviewWidget() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.vncStatus,
    queryFn: () => api.get<RemoteViewerStatus>('/api/vnc/status'),
    refetchInterval: 30_000,
  })

  const isReachable = data?.reachable ?? false
  const isInUse = (data?.active ?? 0) > 0
  const label = isLoading
    ? 'Checking'
    : isReachable
      ? (isInUse ? 'Viewer Active' : 'Viewer Ready')
      : 'Viewer Offline'

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
        border: `2px solid ${isReachable ? 'var(--green-400)' : 'var(--border)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isReachable ? 'var(--green-400)' : 'var(--text-tertiary)',
        }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </button>
  )
})
