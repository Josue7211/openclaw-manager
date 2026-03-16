import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

import { api, ApiError } from '@/lib/api'
import { emit } from '@/lib/event-bus'
import type { Mission } from '@/lib/types'
import { isDemoMode, DEMO_MISSIONS, DEMO_AGENT_STATUS, DEMO_AGENTS } from '@/lib/demo-data'

import type { StatusData, HeartbeatData, MemoryEntry, Session, AgentInfo, AgentsData, SubagentData, ActiveSubagentData, Idea } from './types'

export function useDashboardData() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()
  const [status, setStatus]           = useState<StatusData | null>(_demo ? DEMO_AGENT_STATUS : null)
  const [heartbeat, setHeartbeat]     = useState<HeartbeatData | null>(_demo ? { lastCheck: new Date().toISOString(), status: 'idle', tasks: [] } : null)
  const [sessions, setSessions]       = useState<Session[]>([])
  const [subagents, setSubagents]     = useState<SubagentData | null>(_demo ? { count: 0, agents: [] } : null)
  const [agentsData, setAgentsData]   = useState<AgentsData | null>(_demo ? { agents: DEMO_AGENTS, activeSessions: [] } : null)
  const [mounted, setMounted]             = useState(_demo)
  const [backendError, setBackendError]   = useState<string | false>(false)
  const mountedRef                        = useRef(_demo)
  const researchMissionIdRef = useRef<string | null>(null)
  const cacheDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [panelIdea, setPanelIdea] = useState<Idea | null>(null)
  const realtimeConnectedRef = useRef(false)
  const fastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── React Query: memory ──
  const { data: memoryData, dataUpdatedAt: memoryUpdatedAt } = useQuery({
    queryKey: queryKeys.memory,
    queryFn: () => api.get<{ entries?: MemoryEntry[] }>('/api/memory').then(d => d.entries || []),
    refetchInterval: 30_000,
    enabled: !_demo,
  })
  const memory = memoryData ?? []

  // ── React Query: pending ideas ──
  const { data: pendingIdeasData } = useQuery({
    queryKey: queryKeys.ideas('pending'),
    queryFn: () => api.get<{ ideas?: Idea[] }>('/api/ideas?status=pending').then(d => d.ideas || []),
    enabled: !_demo,
  })
  const pendingIdeas = pendingIdeasData ?? []
  const lastRefreshMs = memoryUpdatedAt || Date.now()

  // ── React Query: active subagents ──
  const { data: activeSubagentsData, isError: subagentsError } = useQuery<ActiveSubagentData>({
    queryKey: queryKeys.subagentsActive,
    queryFn: () => api.get<ActiveSubagentData>('/api/subagents/active'),
    refetchInterval: 10_000,
    enabled: !_demo,
  })
  const activeSubagents = activeSubagentsData ?? { active: false, count: 0, tasks: [] }

  // ── React Query: missions ──
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

  // ── Data-fetching primitives ──

  const applyCache = useCallback((cacheRows: Array<{ key: string; value: unknown }>) => {
    const cm = Object.fromEntries(cacheRows.map((r) => [r.key, r.value]))
    if (cm.status) setStatus(cm.status as StatusData)
    if (cm.heartbeat) setHeartbeat(cm.heartbeat as HeartbeatData)
    if (cm.sessions) setSessions(((cm.sessions as { sessions?: Session[] }).sessions) || [])
    if (cm.subagents) setSubagents(cm.subagents as SubagentData)
    if (cm.agents) setAgentsData(cm.agents as AgentsData)
    if (!mountedRef.current) {
      mountedRef.current = true
      setMounted(true)
    }
  }, [])

  const readCache = useCallback(async () => {
    const flat = await api.get<Record<string, unknown>>('/api/cache')
    return Object.entries(flat).map(([key, value]) => ({ key, value })) as Array<{ key: string; value: unknown }>
  }, [])

  const triggerCacheRefresh = useCallback(async () => {
    try {
      await api.post('/api/cache-refresh')
      const cacheRows = await readCache()
      if (cacheRows) applyCache(cacheRows)
      setBackendError(prev => {
        if (prev) queryClient.invalidateQueries({ queryKey: queryKeys.missions })
        return false
      })
    } catch (e) {
      setBackendError(e instanceof ApiError ? e.serviceLabel : 'Service unavailable')
    }
  }, [applyCache, readCache, queryClient])

  // Research cron -> mission sync
  const syncResearchMission = useCallback(async () => {
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
          if (!researchMissionIdRef.current) researchMissionIdRef.current = existing.id
          if (existing.status !== 'active') {
            await api.patch('/api/missions', { id: existing.id, status: 'active' }).catch(() => {})
          }
        }
      } else if (lastStatus === 'success' || (lastRun > 0 && !seemsRunning)) {
        const targetId = researchMissionIdRef.current ?? existing?.id
        if (existing && existing.status === 'active' && targetId) {
          await api.patch('/api/missions', { id: targetId, status: 'done' }).catch(() => {})
        }
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.missions })
    } catch { /* silent */ }
  }, [queryClient])

  // ── Consolidated ticks ──
  const fastTick = useCallback(async () => {
    await triggerCacheRefresh()
  }, [triggerCacheRefresh])

  const slowTick = useCallback(() => {
    syncResearchMission()
    api.post('/api/missions/sync-agents').catch(() => {})
  }, [syncResearchMission])

  // ── Interval helpers ──
  const startFastInterval = useCallback(() => {
    if (fastIntervalRef.current) return
    fastIntervalRef.current = setInterval(fastTick, 10_000)
  }, [fastTick])

  const stopFastInterval = useCallback(() => {
    if (fastIntervalRef.current) { clearInterval(fastIntervalRef.current); fastIntervalRef.current = null }
  }, [])

  const startSlowInterval = useCallback(() => {
    if (slowIntervalRef.current) return
    slowIntervalRef.current = setInterval(slowTick, 30_000)
  }, [slowTick])

  const stopSlowInterval = useCallback(() => {
    if (slowIntervalRef.current) { clearInterval(slowIntervalRef.current); slowIntervalRef.current = null }
  }, [])

  // ── Ensure dashboard shows content after 3s even if cache reads fail ──
  useEffect(() => {
    const t = setTimeout(() => {
      if (!mountedRef.current) {
        mountedRef.current = true
        setMounted(true)
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  // ── Real-time subscriptions for missions, agents, and ideas ──
  useEffect(() => {
    if (!supabase) return

    const missionsChannel = supabase
      .channel('missions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.missions })
        emit('mission-updated', null, 'supabase')
      })
      .subscribe()

    const agentsSub = supabase
      .channel('agents-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, (payload: RealtimePostgresChangesPayload<AgentInfo>) => {
        setAgentsData(prev => {
          if (!prev) return prev
          let updated = prev.agents
          if (payload.eventType === 'UPDATE') {
            updated = prev.agents.map(a => a.id === (payload.new as AgentInfo).id ? { ...a, ...(payload.new as AgentInfo) } : a)
          } else if (payload.eventType === 'INSERT') {
            updated = [...prev.agents, payload.new as AgentInfo]
          } else if (payload.eventType === 'DELETE') {
            updated = prev.agents.filter(a => a.id !== (payload.old as AgentInfo).id)
          }
          return { ...prev, agents: updated }
        })
      })
      .subscribe()

    const ideasChannel = supabase
      .channel('ideas-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.ideas('pending') })
      })
      .subscribe()

    return () => {
      supabase?.removeChannel(missionsChannel)
      supabase?.removeChannel(agentsSub)
      supabase?.removeChannel(ideasChannel)
    }
  }, [queryClient])

  // ── Main polling orchestrator ──
  useEffect(() => {
    if (_demo) return

    readCache().then((data) => {
      if (data?.length) applyCache(data)
    }).catch(() => {})
    api.post('/api/cache-refresh').catch(() => {})

    fastTick()
    slowTick()

    if (!realtimeConnectedRef.current) startFastInterval()
    startSlowInterval()

    let cacheChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    if (supabase) {
      cacheChannel = supabase
        .channel('cache-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cache' }, () => {
          if (cacheDebounceRef.current) clearTimeout(cacheDebounceRef.current)
          cacheDebounceRef.current = setTimeout(() => {
            readCache().then((data) => {
              if (data) applyCache(data)
            }).catch(() => {})
          }, 200)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            realtimeConnectedRef.current = true
            stopFastInterval()
          } else {
            realtimeConnectedRef.current = false
            if (!document.hidden) startFastInterval()
          }
        })
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopFastInterval()
        stopSlowInterval()
      } else {
        fastTick()
        slowTick()
        if (!realtimeConnectedRef.current) startFastInterval()
        startSlowInterval()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const onFocus = () => { if (!document.hidden) fastTick() }
    window.addEventListener('focus', onFocus)

    return () => {
      stopFastInterval()
      stopSlowInterval()
      if (cacheChannel) supabase?.removeChannel(cacheChannel)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, [fastTick, slowTick, readCache, applyCache, startFastInterval, stopFastInterval, startSlowInterval, stopSlowInterval])

  const handleIdeaAction = useCallback(async (id: string, status: 'approved' | 'deferred' | 'rejected') => {
    await api.patch('/api/ideas', { id, status }).catch(() => {})
    queryClient.invalidateQueries({ queryKey: queryKeys.ideas('pending') })
    setPanelIdea(prev => (prev?.id === id ? null : prev))
  }, [queryClient])

  // Dynamic agent ordering
  const sortedAgents = useMemo(() => {
    const agents = agentsData?.agents || []
    return [...agents].sort((a, b) => {
      const aIsBjorn = a.display_name.toLowerCase().includes('bjorn')
      const bIsBjorn = b.display_name.toLowerCase().includes('bjorn')
      if (aIsBjorn) return -1
      if (bIsBjorn) return 1
      const aIsActiveCoding = a.status === 'active' && a.model.toLowerCase().includes('claude-code-cli')
      const bIsActiveCoding = b.status === 'active' && b.model.toLowerCase().includes('claude-code-cli')
      if (aIsActiveCoding && !bIsActiveCoding) return -1
      if (!aIsActiveCoding && bIsActiveCoding) return 1
      return (a.sort_order ?? 999) - (b.sort_order ?? 999)
    })
  }, [agentsData?.agents])

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

  return {
    _demo,
    mounted,
    backendError,
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
