import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Robot } from '@phosphor-icons/react'
import { useAgents } from '@/hooks/useAgents'
import { useTableRealtime } from '@/lib/hooks/useRealtimeSSE'
import { useGatewaySSE } from '@/lib/hooks/useGatewaySSE'
import { queryKeys } from '@/lib/query-keys'
import { api } from '@/lib/api'
import { isDemoMode, DEMO_AGENTS } from '@/lib/demo-data'
import { SkeletonList } from '@/components/Skeleton'
import { AgentList } from './agents/AgentList'
import { AgentDetailPanel } from './agents/AgentDetailPanel'
import type { Agent, AgentAction } from './agents/types'

export default function AgentsPage() {
  const _demo = isDemoMode()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listWidth, setListWidth] = useState(320)

  const { agents: realAgents, loading, createMutation, updateMutation, deleteMutation, actionMutation } = useAgents()
  const agents: Agent[] = _demo ? (DEMO_AGENTS as unknown as Agent[]) : realAgents

  // OpenClaw health check
  const { data: healthData } = useQuery({
    queryKey: ['openclaw', 'health'],
    queryFn: () => api.get<{ ok: boolean }>('/api/openclaw/health'),
    staleTime: 30_000,
    enabled: !_demo,
  })
  const openclawHealthy = healthData?.ok ?? false

  // Real-time subscription via SSE
  useTableRealtime('agents', { queryKey: queryKeys.agents })

  // Gateway agent events invalidate the activity feed so it stays fresh
  // when agents start/stop/error. The useAgents hook already handles
  // queryKeys.agents invalidation from Task 1 -- this subscription
  // separately keeps the gateway events feed (used by Phase 90) up to date.
  useGatewaySSE(_demo ? {} : {
    events: ['agent'],
    queryKeys: {
      agent: queryKeys.gatewayEvents,
    },
  })

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null

  // Resize handle
  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = listWidth
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setListWidth(Math.max(200, Math.min(startWidth + delta, 500)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [listWidth])

  const handleCreate = useCallback(() => {
    createMutation.mutate(
      { display_name: 'New Agent', emoji: '\uD83E\uDD16' },
      {
        onSuccess: (data) => {
          if (data?.agent?.id) setSelectedId(data.agent.id)
        },
      }
    )
  }, [createMutation])

  const handleUpdate = useCallback((id: string, fields: Partial<Agent>) => {
    updateMutation.mutate({ id, ...fields })
  }, [updateMutation])

  const handleDelete = useCallback((id: string) => {
    const idx = agents.findIndex((a) => a.id === id)
    const next = agents[idx + 1] ?? agents[idx - 1] ?? null
    deleteMutation.mutate(id)
    setSelectedId(next?.id ?? null)
  }, [agents, deleteMutation])

  const handleAction = useCallback((id: string, action: AgentAction) => {
    actionMutation.mutate({ id, action })
  }, [actionMutation])

  if (loading) {
    return (
      <div style={{ padding: '20px 28px' }}>
        <SkeletonList count={3} lines={4} layout="grid" />
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      margin: '-20px -28px',
      display: 'flex', overflow: 'hidden',
    }}>
      {/* Left panel: agent list */}
      <div style={{
        width: listWidth, minWidth: listWidth,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <AgentList
          agents={agents}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={handleCreate}
        />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResize}
        style={{
          width: 4, cursor: 'col-resize',
          background: 'transparent', flexShrink: 0,
          marginLeft: -2, marginRight: -2, zIndex: 10,
          position: 'relative',
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize agent list"
      />

      {/* Right panel: detail or empty state */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedAgent ? (
          <AgentDetailPanel
            agent={selectedAgent}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onAction={handleAction}
            openclawHealthy={openclawHealthy}
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px',
          }}>
            <Robot size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Select an agent to view settings
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
