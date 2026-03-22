import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { useRealtimeSSE } from '@/lib/hooks/useRealtimeSSE'
import type { Idea } from '@/pages/dashboard/types'

export function useIdeas() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()

  const { data: pendingIdeasData } = useQuery({
    queryKey: queryKeys.ideas('pending'),
    queryFn: () => api.get<{ ideas?: Idea[] }>('/api/ideas?status=pending').then(d => d.ideas || []),
    enabled: !_demo,
  })
  const pendingIdeas = pendingIdeasData ?? []

  const [panelIdea, setPanelIdea] = useState<Idea | null>(null)

  // SSE invalidation for ideas
  useRealtimeSSE(['ideas'], {
    queryKeys: { ideas: queryKeys.ideas('pending') },
  })

  const handleIdeaAction = useCallback(async (id: string, status: 'approved' | 'deferred' | 'rejected') => {
    await api.patch('/api/ideas', { id, status }).catch(() => {})
    queryClient.invalidateQueries({ queryKey: queryKeys.ideas('pending') })
    setPanelIdea(prev => (prev?.id === id ? null : prev))
  }, [queryClient])

  return { pendingIdeas, panelIdea, setPanelIdea, handleIdeaAction }
}
