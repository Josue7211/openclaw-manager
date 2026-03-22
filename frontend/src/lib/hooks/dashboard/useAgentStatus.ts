import { useAgentCache } from './useAgentCache'
import { isDemoMode, DEMO_AGENT_STATUS } from '@/lib/demo-data'
import type { StatusData } from '@/pages/dashboard/types'

export function useAgentStatus() {
  const _demo = isDemoMode()
  const { data, isSuccess } = useAgentCache<StatusData | null>(
    cache => (cache?.status as StatusData) ?? null
  )
  return {
    status: _demo ? (DEMO_AGENT_STATUS as StatusData) : data ?? null,
    mounted: _demo || isSuccess,
  }
}
