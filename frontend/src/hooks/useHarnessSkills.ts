import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { SkillsResponse } from '@/pages/harness/types'

export function useHarnessSkills() {
  const { data, isLoading, error } = useQuery<SkillsResponse>({
    queryKey: queryKeys.harnessSkills,
    queryFn: () => api.get<SkillsResponse>('/api/harness/skills'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { skills: data, loading: isLoading, error }
}
