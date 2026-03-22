import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { MemoryEntry } from '@/pages/dashboard/types'

export function useMemoryEntries() {
  const _demo = isDemoMode()

  const { data: memoryData, dataUpdatedAt: memoryUpdatedAt } = useQuery({
    queryKey: queryKeys.memory,
    queryFn: () => api.get<{ entries?: MemoryEntry[] }>('/api/memory').then(d => d.entries || []),
    refetchInterval: 30_000,
    enabled: !_demo,
  })

  const memory = memoryData ?? []
  const lastRefreshMs = memoryUpdatedAt || Date.now()

  return { memory, lastRefreshMs }
}
