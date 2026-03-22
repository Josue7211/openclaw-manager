import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { Idea } from '@/pages/pipeline/types'

const DEMO_IDEAS: Idea[] = [
  { id: 'demo-i1', title: 'Auto-triage incoming issues', description: 'Use AI to classify and route new issues', why: 'Saves time', effort: 'medium', impact: 'high', category: 'routing', status: 'pending', created_at: new Date(Date.now() - 3_600_000).toISOString() },
  { id: 'demo-i2', title: 'Weekly digest email', description: 'Send a summary of activity each week', why: 'Visibility', effort: 'low', impact: 'medium', category: 'user-preferences', status: 'pending', created_at: new Date(Date.now() - 86_400_000).toISOString() },
  { id: 'demo-i3', title: 'Dark mode improvements', description: 'Better contrast in sidebar', why: 'Accessibility', effort: 'low', impact: 'low', category: 'user-preferences', status: 'approved', created_at: new Date(Date.now() - 172_800_000).toISOString() },
  { id: 'demo-i4', title: 'Agent memory compression', description: 'Compress old memory entries', why: 'Performance', effort: 'high', impact: 'high', category: 'delegation', status: 'built', created_at: new Date(Date.now() - 259_200_000).toISOString() },
]

export function usePipelineIdeas() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<{ ideas?: Idea[] }>({
    queryKey: queryKeys.ideas('all'),
    queryFn: () => api.get<{ ideas?: Idea[] }>('/api/ideas'),
    enabled: !_demo,
  })

  const allIdeas = _demo ? DEMO_IDEAS : (data?.ideas ?? [])

  const pendingCount = useMemo(
    () => allIdeas.filter(i => i.status === 'pending').length,
    [allIdeas],
  )

  const approvedCount = useMemo(
    () => allIdeas.filter(i => i.status === 'approved').length,
    [allIdeas],
  )

  const builtCount = useMemo(
    () => allIdeas.filter(i => i.status === 'built').length,
    [allIdeas],
  )

  return { ideas: allIdeas, pendingCount, approvedCount, builtCount, mounted: _demo || isSuccess }
}
