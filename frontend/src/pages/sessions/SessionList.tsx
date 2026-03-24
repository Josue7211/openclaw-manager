import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { GatewayStatusDot } from '@/components/GatewayStatusDot'
import { SessionCard } from './SessionCard'
import { NewSessionForm } from './NewSessionForm'
import type { CreateSessionPayload } from './types'

interface SessionListProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

export function SessionList({ selectedId, onSelect }: SessionListProps) {
  const [showForm, setShowForm] = useState(false)
  const queryClient = useQueryClient()
  const demo = isDemoMode()

  const { sessions, available, isLoading, source } = useGatewaySessions()

  const createMutation = useMutation({
    mutationFn: (payload: CreateSessionPayload) =>
      api.post<{ id: string }>('/api/claude-sessions', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeSessions })
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
      setShowForm(false)
    },
  })

  const killMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: boolean }>(`/api/claude-sessions/${id}/kill`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeSessions })
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    },
  })

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Sessions
          </span>
          <GatewayStatusDot size={7} />
          {source !== 'none' && (
            <span style={{
              fontSize: '9px',
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              background: 'var(--hover-bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1px 5px',
              textTransform: 'uppercase',
            }}>
              {source === 'gateway' ? 'ws' : 'cli'}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          aria-label="New session"
          title="New session"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'background 0.15s',
            fontFamily: 'inherit',
          }}
          className="hover-bg"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {/* Demo mode banner */}
        {demo && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'var(--blue-a08)',
              border: '1px solid var(--blue-a25)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--blue-solid)' }}>Sessions not configured</span>
            <br />
            Connect OpenClaw in Settings to manage Claude sessions.
          </div>
        )}

        {/* Unreachable banner */}
        {!demo && !available && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'var(--red-500)14',
              border: '1px solid var(--red-500)33',
              color: 'var(--red-500)',
              fontSize: '12px',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            OpenClaw is unreachable
          </div>
        )}

        {/* New session form */}
        {showForm && (
          <NewSessionForm
            onSubmit={(payload) => createMutation.mutate(payload)}
            onCancel={() => setShowForm(false)}
            isSubmitting={createMutation.isPending}
            available={available}
          />
        )}

        {/* Loading state */}
        {isLoading && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}>
            Loading...
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sessions.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}>
            No active sessions
          </div>
        )}

        {/* Session cards */}
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            selected={session.id === selectedId}
            onSelect={() => onSelect(session.id)}
            onKill={(id) => killMutation.mutate(id)}
            available={available}
            isKilling={killMutation.isPending}
          />
        ))}
      </div>
    </div>
  )
}
