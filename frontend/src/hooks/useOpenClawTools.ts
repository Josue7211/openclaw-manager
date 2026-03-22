import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { ToolsResponse } from '@/pages/openclaw/types'

export function useOpenClawTools() {
  const { data, isLoading, error } = useQuery<ToolsResponse>({
    queryKey: queryKeys.openclawTools,
    queryFn: () => api.get<ToolsResponse>('/api/openclaw/tools'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { tools: data, loading: isLoading, error }
}
