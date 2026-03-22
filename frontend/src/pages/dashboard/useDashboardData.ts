/**
 * useDashboardData — thin composition layer that delegates to extracted kernel hooks.
 *
 * Keeps the DashboardDataContext API shape identical so Dashboard.tsx and any
 * existing consumers continue to work. Individual widgets can also import hooks
 * directly from `@/lib/hooks/dashboard` for standalone use.
 */

import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { api, ApiError } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'

import {
  useAgentCacheSSE,
  useAgentStatus,
  useHeartbeat,
  useSessions,
  useSubagentData,
  useAgentsData,
  useMissions,
  useIdeas,
  useMemoryEntries,
} from '@/lib/hooks/dashboard'

import type { Mission } from '@/lib/types'

export function useDashboardData() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()

  // ── Kernel hooks ──
  const { status, mounted: statusMounted } = useAgentStatus()
  const { heartbeat, mounted: heartbeatMounted } = useHeartbeat()
  const { sessions, mounted: sessionsMounted } = useSessions()
  const { subagents, activeSubagents, subagentsError } = useSubagentData()
  const { agentsData, sortedAgents, mounted: agentsMounted } = useAgentsData()
  const { missions, updateMissionStatus, deleteMission } = useMissions()
  const { pendingIdeas, panelIdea, setPanelIdea, handleIdeaAction } = useIdeas()
  const { memory, lastRefreshMs } = useMemoryEntries()

  // Consider "mounted" when either demo mode or the cache has successfully loaded
  const mounted = _demo || statusMounted || heartbeatMounted || sessionsMounted || agentsMounted

  // ── SSE invalidation for cache ──
  useAgentCacheSSE()

  // ── Backend error tracking (cache-refresh fallback) ──
  const backendErrorRef = useRef<string | false>(false)

  // ── Research cron → mission sync ──
  const syncResearchMission = useCallback(async () => {
    const researchMissionIdRef = syncResearchMission._missionId
    try {
      const [{ jobs }, { missions: missionList }] = await Promise.all([
        api.get<{ jobs: Array<{ name: string; state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastRunStatus?: string }; enabled?: boolean }> }>('/api/crons').catch(() => ({ jobs: [] as Array<{ name: string; state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastRunStatus?: string }; enabled?: boolean }> })),
        api.get<{ missions: Mission[] }>('/api/missions').catch(() => ({ missions: [] as Mission[] })),
      ])
      const cron = (jobs as Array<{ name: string; state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastRunStatus?: string }; enabled?: boolean }>)
        .find(j => j.name === 'bjorn-research-agent')
      if (!cron) return

      const now = Date.now()
      const lastRun = cron.state?.lastRunAtMs ?? 0
      const nextRun = cron.state?.nextRunAtMs ?? Infinity
      const lastStatus = cron.state?.lastRunStatus ?? ''
      const seemsRunning =
        (lastStatus === 'running') ||
        (nextRun < now && now - nextRun < 300000)
      const existing = (missionList as Mission[]).find(m => m.title === 'Research')

      if (seemsRunning) {
        if (!existing) {
          const created = await api.post<{ mission?: { id: string } }>('/api/missions', { title: 'Research', assignee: 'bjorn' }).catch(() => null)
          if (created?.mission?.id) syncResearchMission._missionId = created.mission.id
        } else {
          if (!researchMissionIdRef) syncResearchMission._missionId = existing.id
          if (existing.status !== 'active') {
            await api.patch('/api/missions', { id: existing.id, status: 'active' }).catch(() => {})
          }
        }
      } else if (lastStatus === 'success' || (lastRun > 0 && !seemsRunning)) {
        const targetId = researchMissionIdRef ?? existing?.id
        if (existing && existing.status === 'active' && targetId) {
          await api.patch('/api/missions', { id: targetId, status: 'done' }).catch(() => {})
        }
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.missions })
    } catch { /* silent */ }
  }, [queryClient])
  // Attach mutable state to the function for the research mission ID
  syncResearchMission._missionId = syncResearchMission._missionId ?? (null as string | null)

  // ── Polling orchestration ──
  const triggerCacheRefresh = useCallback(async () => {
    try {
      await api.post('/api/cache-refresh')
      queryClient.invalidateQueries({ queryKey: queryKeys.agentCache })
      if (backendErrorRef.current) {
        queryClient.invalidateQueries({ queryKey: queryKeys.missions })
      }
      backendErrorRef.current = false
    } catch (e) {
      backendErrorRef.current = e instanceof ApiError ? e.serviceLabel : 'Service unavailable'
    }
  }, [queryClient])

  const fastTick = useCallback(async () => {
    await triggerCacheRefresh()
  }, [triggerCacheRefresh])

  const slowTick = useCallback(() => {
    syncResearchMission()
    api.post('/api/missions/sync-agents').catch(() => {})
  }, [syncResearchMission])

  // ── Main polling orchestrator ──
  useEffect(() => {
    if (_demo) return

    api.post('/api/cache-refresh').catch(() => {})

    fastTick()
    slowTick()

    let fastInterval: ReturnType<typeof setInterval> | null = setInterval(fastTick, 10_000)
    let slowInterval: ReturnType<typeof setInterval> | null = setInterval(slowTick, 30_000)

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (fastInterval) { clearInterval(fastInterval); fastInterval = null }
        if (slowInterval) { clearInterval(slowInterval); slowInterval = null }
      } else {
        fastTick()
        slowTick()
        if (!fastInterval) fastInterval = setInterval(fastTick, 10_000)
        if (!slowInterval) slowInterval = setInterval(slowTick, 30_000)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const onFocus = () => { if (!document.hidden) fastTick() }
    window.addEventListener('focus', onFocus)

    return () => {
      if (fastInterval) clearInterval(fastInterval)
      if (slowInterval) clearInterval(slowInterval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, [_demo, fastTick, slowTick])

  return {
    _demo,
    mounted,
    backendError: backendErrorRef.current,
    status,
    heartbeat,
    sessions,
    subagents,
    agentsData,
    activeSubagents,
    subagentsError,
    missions,
    memory,
    pendingIdeas,
    lastRefreshMs,
    panelIdea, setPanelIdea,
    sortedAgents,
    fastTick,
    slowTick,
    handleIdeaAction,
    updateMissionStatus,
    deleteMission,
  }
}
