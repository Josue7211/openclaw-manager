import { useMemo } from 'react'
import { useAgentCache } from './useAgentCache'
import { isDemoMode, DEMO_AGENTS } from '@/lib/demo-data'
import type { AgentsData, AgentInfo } from '@/features/dashboard/types'

export function useAgentsData() {
  const _demo = isDemoMode()
  const { data, isSuccess } = useAgentCache<AgentsData | null>(
    cache => (cache?.agents as AgentsData) ?? null
  )

  const agentsData = _demo
    ? { agents: DEMO_AGENTS as unknown as AgentInfo[], activeSessions: [] as string[] }
    : data ?? null

  // Dynamic agent ordering: active coding agents first, then by sort_order
  const sortedAgents = useMemo(() => {
    const agents = agentsData?.agents || []
    return [...agents].sort((a, b) => {
      const aIsActiveCoding = a.status === 'active' && a.model.toLowerCase().includes('claude-code-cli')
      const bIsActiveCoding = b.status === 'active' && b.model.toLowerCase().includes('claude-code-cli')
      if (aIsActiveCoding && !bIsActiveCoding) return -1
      if (!aIsActiveCoding && bIsActiveCoding) return 1
      return (a.sort_order ?? 999) - (b.sort_order ?? 999)
    })
  }, [agentsData?.agents])

  return {
    agentsData,
    sortedAgents,
    mounted: _demo || isSuccess,
  }
}
