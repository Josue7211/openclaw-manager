import { useQuery } from '@tanstack/react-query'
import { useAgentCache } from './useAgentCache'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { SubagentData, ActiveSubagentData } from '@/pages/dashboard/types'

const DEMO_SUBAGENTS: SubagentData = { count: 0, agents: [] }
const EMPTY_ACTIVE: ActiveSubagentData = { active: false, count: 0, tasks: [] }

export function useSubagentData() {
  const _demo = isDemoMode()

  // Subagent count from cache
  const { data: subagents } = useAgentCache<SubagentData | null>(
    cache => (cache?.subagents as SubagentData) ?? null
  )

  // Active subagents from dedicated endpoint (already React Query based)
  const { data: activeSubagentsData, isError: subagentsError } = useQuery<ActiveSubagentData>({
    queryKey: queryKeys.subagentsActive,
    queryFn: () => api.get<ActiveSubagentData>('/api/subagents/active'),
    refetchInterval: 10_000,
    enabled: !_demo,
  })

  return {
    subagents: _demo ? DEMO_SUBAGENTS : subagents ?? null,
    activeSubagents: activeSubagentsData ?? EMPTY_ACTIVE,
    subagentsError,
  }
}
