import { useAgentCache } from './useAgentCache'
import { isDemoMode } from '@/lib/demo-data'
import type { HeartbeatData } from '@/pages/dashboard/types'

const DEMO_HEARTBEAT: HeartbeatData = {
  lastCheck: new Date().toISOString(),
  status: 'idle',
  tasks: [],
}

export function useHeartbeat() {
  const _demo = isDemoMode()
  const { data, isSuccess } = useAgentCache<HeartbeatData | null>(
    cache => (cache?.heartbeat as HeartbeatData) ?? null
  )
  return {
    heartbeat: _demo ? DEMO_HEARTBEAT : data ?? null,
    mounted: _demo || isSuccess,
  }
}
