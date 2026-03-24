import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { SessionHistoryResponse } from '@/pages/sessions/types'

export function useSessionHistory(sessionId: string | null) {
  const demo = isDemoMode()

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.sessionHistory(sessionId ?? ''),
    queryFn: () => api.get<SessionHistoryResponse>(`/api/gateway/sessions/${sessionId}/history`),
    enabled: !!sessionId && !demo,
    staleTime: 30_000,
    retry: 1,
  })

  return {
    messages: data?.messages ?? [],
    isLoading,
    error: error ? String(error) : null,
  }
}
