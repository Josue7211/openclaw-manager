/**
 * useAgentCache — shared React Query hook that fetches the /api/cache blob
 * and lets individual hooks select their slice via the `select` option.
 *
 * React Query's structural sharing ensures consumers only re-render when
 * their selected slice actually changes. This replaces the manual polling +
 * useState pattern that was in useDashboardData.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { useRealtimeSSE } from '@/lib/hooks/useRealtimeSSE'

export function useAgentCache<T>(select: (data: Record<string, unknown>) => T) {
  const _demo = isDemoMode()
  return useQuery({
    queryKey: queryKeys.agentCache,
    queryFn: () => api.get<Record<string, unknown>>('/api/cache'),
    refetchInterval: 10_000,
    enabled: !_demo,
    select,
  })
}

/**
 * useAgentCacheSSE — sets up SSE invalidation for the agent cache.
 * Call this once (e.g. from useDashboardData) to keep the cache fresh via
 * real-time events from the backend.
 */
export function useAgentCacheSSE() {
  const queryClient = useQueryClient()
  const cacheDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const invalidateCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.agentCache })
  }, [queryClient])

  useRealtimeSSE(['cache', 'agents'], {
    onEvent: (table) => {
      if (table === 'agents') {
        invalidateCache()
      }
      if (table === 'cache') {
        if (cacheDebounceRef.current) clearTimeout(cacheDebounceRef.current)
        cacheDebounceRef.current = setTimeout(invalidateCache, 200)
      }
    },
  })

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (cacheDebounceRef.current) clearTimeout(cacheDebounceRef.current)
    }
  }, [])
}
