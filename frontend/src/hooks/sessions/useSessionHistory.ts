import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { SessionHistoryResponse } from '@/features/sessions/types'

export function sessionHistoryPath(sessionId: string, limit = 50, environmentId?: string | null): string {
  const params = new URLSearchParams({ limit: String(limit) })
  const environment = environmentId?.trim()
  if (environment) params.set('environmentId', environment)
  return `/api/gateway/sessions/${encodeURIComponent(sessionId)}/history?${params.toString()}`
}

export function useSessionHistory(sessionId: string | null, limit = 50, environmentId?: string | null) {
  const demo = isDemoMode()
  const environment = environmentId?.trim() || ''

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.sessionHistory(sessionId ?? '', environment),
    queryFn: () =>
      api.get<SessionHistoryResponse>(
        sessionHistoryPath(sessionId!, limit, environment),
      ),
    enabled: !!sessionId && !demo,
    staleTime: 30_000,
    retry: 1,
  })

  return {
    messages: data?.messages ?? [],
    hasMore: data?.hasMore ?? false,
    isLoading,
    error: error ? String(error) : null,
  }
}
