



import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MISSION_STATUS } from '@/lib/constants'
import { SkeletonList } from '@/components/Skeleton'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useSupabaseRealtime } from '@/lib/hooks/useSupabaseRealtime'
import { PageHeader } from '@/components/PageHeader'
import { isDemoMode, DEMO_AGENTS, DEMO_MISSIONS } from '@/lib/demo-data'
import { DemoBadge } from '@/components/DemoModeBanner'
import type { Mission } from '@/lib/types'
import type { Agent } from './agents/types'
import { AgentCard } from './agents/AgentCard'
import { LiveProcesses } from './agents/LiveProcesses'

export default function AgentsPage() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()

  const { data: agentsData, isLoading: agentsLoading } = useQuery<{ agents: Agent[] }>({
    queryKey: queryKeys.agents,
    queryFn: () => api.get<{ agents: Agent[] }>('/api/agents'),
    enabled: !_demo,
  })

  const { data: missionsData } = useQuery<{ missions: Mission[] }>({
    queryKey: queryKeys.missions,
    queryFn: () => api.get<{ missions: Mission[] }>('/api/missions'),
    enabled: !_demo,
  })

  const loading = _demo ? false : agentsLoading
  const agents = _demo
    ? (DEMO_AGENTS as unknown as Agent[])
    : (agentsData?.agents ?? [])
  const missions = _demo ? (DEMO_MISSIONS as Mission[]) : (missionsData?.missions ?? [])

  const saveMutation = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: { display_name: string; emoji: string; role: string; model: string } }) => {
      return api.patch('/api/agents', { id, ...fields })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents })
    },
  })

  async function handleSave(id: string, fields: { display_name: string; emoji: string; role: string; model: string }) {
    await saveMutation.mutateAsync({ id, fields })
  }

  // Real-time subscription (only when supabase client is available)
  useSupabaseRealtime('agents-realtime', 'agents', { queryKey: queryKeys.agents })

  return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <PageHeader defaultTitle="Agents" defaultSubtitle="Your AI workforce · real-time" />
            {_demo && <DemoBadge />}
          </div>
        </div>

        {loading ? (
          <SkeletonList count={3} lines={4} layout="grid" />
        ) : (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
              Permanent
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {agents.map(agent => {
                const activeMission = missions.find(
                  m => m.status === MISSION_STATUS.ACTIVE && m.assignee === agent.id
                ) ?? null
                return (
                  <AgentCard key={agent.id} agent={agent} onSave={handleSave} activeMission={activeMission} />
                )
              })}
            </div>
          </div>
        )}

        <LiveProcesses agents={agents} />
      </div>
  )
}
