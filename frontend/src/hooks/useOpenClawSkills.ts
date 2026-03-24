import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { SkillsResponse } from '@/pages/openclaw/types'

export function useOpenClawSkills() {
  const { data, isLoading, error } = useQuery<SkillsResponse>({
    queryKey: queryKeys.openclawSkills,
    queryFn: () => api.get<SkillsResponse>('/api/openclaw/skills'),
    refetchInterval: 30_000,
    staleTime: 30_000,
  })
  return { skills: data, loading: isLoading, error }
}
