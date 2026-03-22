import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { UsageData } from '@/pages/openclaw/types'

export function useOpenClawUsage() {
  const { data, isLoading, error } = useQuery<UsageData>({
    queryKey: queryKeys.openclawUsage,
    queryFn: () => api.get<UsageData>('/api/openclaw/usage'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { usage: data, loading: isLoading, error }
}
