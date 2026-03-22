import { useAgentCache } from './useAgentCache'
import { isDemoMode } from '@/lib/demo-data'
import type { Session } from '@/pages/dashboard/types'

export function useSessions() {
  const _demo = isDemoMode()
  const { data, isSuccess } = useAgentCache<Session[]>(
    cache => {
      const raw = cache?.sessions as { sessions?: Session[] } | undefined
      return raw?.sessions ?? []
    }
  )
  return {
    sessions: _demo ? [] : data ?? [],
    mounted: _demo || isSuccess,
  }
}
