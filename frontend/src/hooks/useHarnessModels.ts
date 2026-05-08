import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { ModelsResponse } from '@/pages/harness/types'

export function useHarnessModels() {
  const { data, isLoading, error } = useQuery<ModelsResponse>({
    queryKey: queryKeys.harnessModels,
    queryFn: () => api.get<ModelsResponse>('/api/harness/models'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { models: data, loading: isLoading, error }
}
