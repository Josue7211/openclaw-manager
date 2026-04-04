import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { MemoryEntry } from '@/pages/dashboard/types'

type MemdQueryResponse = {
  ok: boolean
  data?: {
    entries?: Array<{
      id: string
      title?: string
      snippet?: string
      summary?: string
      path?: string
      createdAt?: string
      updatedAt?: string
    }>
  }
}

export function useMemoryEntries() {
  const _demo = isDemoMode()

  const {
    data: memoryData,
    dataUpdatedAt: memoryUpdatedAt,
    isLoading: memoryLoading,
  } = useQuery({
    queryKey: queryKeys.memory,
    queryFn: async (): Promise<MemoryEntry[]> => {
      // Prefer MemD. Fall back to legacy /api/memory to avoid breaking older builds.
      try {
        const resp = await api.post<MemdQueryResponse>('/api/memd/query', { limit: 5 })
        const entries = resp?.ok ? (resp.data?.entries ?? []) : []
        return entries.map((e) => {
          const ts = e.updatedAt || e.createdAt || new Date().toISOString()
          const preview = (e.snippet || e.summary || '').toString()
          // `path` is displayed in the Activity Feed; prefer a human-ish label.
          const title = (e.title || 'Memory').toString().trim() || 'Memory'
          const shortId = (e.id || '').slice(0, 8)
          const path = `${title}${shortId ? ` #${shortId}` : ''}`
          return { date: ts, preview, path }
        })
      } catch {
        const d = await api.get<{ entries?: MemoryEntry[] }>('/api/memory')
        return d.entries || []
      }
    },
    refetchInterval: 30_000,
    enabled: !_demo,
  })

  const memory = memoryData ?? []
  const lastRefreshMs = memoryUpdatedAt || Date.now()

  return { memory, lastRefreshMs, loading: !_demo && memoryLoading }
}
