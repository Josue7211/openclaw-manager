import { useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode, DEMO_MISSIONS } from '@/lib/demo-data'
import { useRealtimeSSE } from '@/lib/hooks/useRealtimeSSE'
import { emit } from '@/lib/event-bus'
import type { Mission } from '@/lib/types'

export function useMissions() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()

  const { data: missionsData } = useQuery<{ missions?: Mission[] }>({
    queryKey: queryKeys.missions,
    queryFn: () => api.get<{ missions?: Mission[] }>('/api/missions'),
    enabled: !_demo,
  })

  const allMissions = _demo ? DEMO_MISSIONS : (missionsData?.missions ?? [])
  const missions = useMemo(() => {
    const filtered = allMissions.filter((m: Mission) => m.status !== 'done')
    const seen = new Set<string>()
    return filtered.filter((m: Mission) => {
      const key = m.title.toLowerCase().slice(0, 40)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [allMissions])

  // SSE invalidation for missions
  useRealtimeSSE(['missions'], {
    queryKeys: { missions: queryKeys.missions },
    onEvent: (table) => {
      if (table === 'missions') {
        emit('mission-updated', null, 'supabase')
      }
    },
  })

  const updateMissionStatus = useCallback(async (id: string, currentStatus: string) => {
    const next = currentStatus === 'pending' ? 'active' : currentStatus === 'active' ? 'done' : 'pending'
    try {
      await api.patch('/api/missions', { id, status: next })
      queryClient.invalidateQueries({ queryKey: queryKeys.missions })
    } catch (e) {
      console.error('updateMissionStatus failed:', e)
    }
  }, [queryClient])

  const deleteMission = useCallback(async (id: string) => {
    try {
      await api.del('/api/missions', { id })
      queryClient.invalidateQueries({ queryKey: queryKeys.missions })
    } catch (e) {
      console.error('deleteMission failed:', e)
    }
  }, [queryClient])

  return { missions, updateMissionStatus, deleteMission }
}
