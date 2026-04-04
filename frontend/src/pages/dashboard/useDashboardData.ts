/**
 * useDashboardData — polling orchestration and dashboard-level state.
 *
 * Individual widgets fetch their own data via kernel hooks in
 * `@/lib/hooks/dashboard`. This hook is responsible for:
 *   - Cache-refresh polling (fast 10s, slow 30s) with visibility-aware pausing
 *   - SSE-driven cache invalidation
 *   - Research cron ↔ mission sync
 *   - Backend error tracking
 *   - Idea panel state (shared across Dashboard.tsx and IdeaDetailPanel)
 */

import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { api, ApiError } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'

import {
  useAgentCacheSSE,
  useIdeas,
  useSubagentData,
  useMemoryEntries,
} from '@/lib/hooks/dashboard'

import type { Mission } from '@/lib/types'

export function useDashboardData() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()

  // ── Hooks that provide data consumed directly by Dashboard.tsx ──
  const { subagentsError } = useSubagentData()
  const { panelIdea, setPanelIdea, handleIdeaAction } = useIdeas()
  const { lastRefreshMs } = useMemoryEntries()

  // ── SSE invalidation for cache ──
  useAgentCacheSSE()

  // ── Backend error tracking (cache-refresh fallback) ──
  const backendErrorRef = useRef<string | false>(false)

  // ── Research cron → mission sync ──
  const researchMissionIdRef = useRef<string | null>(null)
  const syncResearchMission = useCallback(async () => {
    const currentMissionId = researchMissionIdRef.current
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
          if (created?.mission?.id) researchMissionIdRef.current = created.mission.id
        } else {
          if (!currentMissionId) researchMissionIdRef.current = existing.id
          if (existing.status !== 'active') {
            await api.patch('/api/missions', { id: existing.id, status: 'active' }).catch(() => {})
          }
        }
      } else if (lastStatus === 'success' || (lastRun > 0 && !seemsRunning)) {
        const targetId = currentMissionId ?? existing?.id
        if (existing && existing.status === 'active' && targetId) {
          await api.patch('/api/missions', { id: targetId, status: 'done' }).catch(() => {})
        }
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.missions })
    } catch { /* silent */ }
  }, [queryClient])

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
    backendError: backendErrorRef.current,
    subagentsError,
    lastRefreshMs,
    panelIdea, setPanelIdea,
    fastTick,
    slowTick,
    handleIdeaAction,
  }
}
