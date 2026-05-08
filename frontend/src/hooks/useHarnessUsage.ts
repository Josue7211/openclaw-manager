import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { UsageData } from '@/pages/harness/types'

export function useHarnessUsage() {
  const { data, isLoading, error } = useQuery<UsageData>({
    queryKey: queryKeys.harnessUsage,
    queryFn: () => api.get<UsageData>('/api/harness/usage'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { usage: data, loading: isLoading, error }
}
