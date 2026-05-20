import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { ToolsResponse } from '@/features/harness/types'

export function useHarnessTools() {
  const { data, isLoading, error } = useQuery<ToolsResponse>({
    queryKey: queryKeys.harnessTools,
    queryFn: () => api.get<ToolsResponse>('/api/harness/tools'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { tools: data, loading: isLoading, error }
}
