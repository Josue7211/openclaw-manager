import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { ModelsResponse } from '@/pages/openclaw/types'

export function useOpenClawModels() {
  const { data, isLoading, error } = useQuery<ModelsResponse>({
    queryKey: queryKeys.openclawModels,
    queryFn: () => api.get<ModelsResponse>('/api/openclaw/models'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { models: data, loading: isLoading, error }
}
