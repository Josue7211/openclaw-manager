


import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import SecondsAgo from '@/components/SecondsAgo'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

import { api, ApiError } from '@/lib/api'
import { emit } from '@/lib/event-bus'
import type { Mission } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { BackendErrorBanner } from '@/components/BackendErrorBanner'
import { isDemoMode, DEMO_MISSIONS, DEMO_AGENT_STATUS, DEMO_AGENTS } from '@/lib/demo-data'
import { DemoBadge } from '@/components/DemoModeBanner'

import type { StatusData, HeartbeatData, MemoryEntry, Session, AgentInfo, AgentsData, SubagentData, ActiveSubagentData, Idea } from './dashboard/types'
import { AgentStatusCard } from './dashboard/AgentStatusCard'
import { HeartbeatCard } from './dashboard/HeartbeatCard'
import { AgentsCard } from './dashboard/AgentsCard'
import { MissionsCard } from './dashboard/MissionsCard'
import { MemoryCard } from './dashboard/MemoryCard'
import { IdeaBriefingCard } from './dashboard/IdeaBriefingCard'
import { NetworkCard } from './dashboard/NetworkCard'
import { SessionsCard } from './dashboard/SessionsCard'
import { IdeaDetailPanel } from './dashboard/IdeaDetailPanel'

export default function Dashboard() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()
  const [status, setStatus]           = useState<StatusData | null>(_demo ? DEMO_AGENT_STATUS : null)
  const [heartbeat, setHeartbeat]     = useState<HeartbeatData | null>(_demo ? { lastCheck: new Date().toISOString(), status: 'idle', tasks: [] } : null)
  const [sessions, setSessions]       = useState<Session[]>([])
  const [subagents, setSubagents]     = useState<SubagentData | null>(_demo ? { count: 0, agents: [] } : null)
  const [agentsData, setAgentsData]   = useState<AgentsData | null>(_demo ? { agents: DEMO_AGENTS, activeSessions: [] } : null)
  // activeSubagents now managed by React Query below
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
  // No refetchInterval — driven by Supabase realtime subscription below
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
  // No refetchInterval — driven by Supabase realtime subscription below
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

  // Apply cache rows into state (used by both polling and realtime)
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

  // Read cache via API — the embedded Axum backend uses the service role key,
  // which bypasses RLS and always returns data.
  const readCache = useCallback(async () => {
    const flat = await api.get<Record<string, unknown>>('/api/cache')
    return Object.entries(flat).map(([key, value]) => ({ key, value })) as Array<{ key: string; value: unknown }>
  }, [])

  // Trigger server cache-refresh then read back
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

  // Research cron → mission sync
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

  // ── Consolidated "fast" tick (10s): cache refresh ──
  // (active subagents are now managed by React Query with refetchInterval: 10_000)
  const fastTick = useCallback(async () => {
    await triggerCacheRefresh()
  }, [triggerCacheRefresh])

  // ── Consolidated "slow" tick (30s): mission syncs ──
  // (memory + ideas are now managed by React Query with their own refetchInterval)
  const slowTick = useCallback(() => {
    syncResearchMission()
    api.post('/api/missions/sync-agents').catch(() => {})
  }, [syncResearchMission])

  // ── Helpers to start / stop consolidated intervals ──
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
  // Two consolidated intervals + realtime cache subscription.
  // Pauses all polling when the page is hidden; resumes when visible.
  useEffect(() => {
    // Skip all polling in demo mode — data is pre-populated
    if (_demo) return

    // Bootstrap: read stale cache immediately, then trigger refresh
    readCache().then((data) => {
      if (data?.length) applyCache(data)
    }).catch(() => {})
    api.post('/api/cache-refresh').catch(() => {})

    // Run both ticks once at mount
    fastTick()
    slowTick()

    // Start fast interval only when realtime is not connected
    if (!realtimeConnectedRef.current) startFastInterval()
    // Slow interval always runs
    startSlowInterval()

    // Realtime cache subscription (when supabase available)
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
            // Realtime handles fast updates — stop polling for them
            stopFastInterval()
          } else {
            realtimeConnectedRef.current = false
            // Realtime lost — fall back to fast polling (unless page is hidden)
            if (!document.hidden) startFastInterval()
          }
        })
    }

    // Pause all polling when page is hidden; resume when visible
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopFastInterval()
        stopSlowInterval()
      } else {
        // Immediately refresh on return
        fastTick()
        slowTick()
        // Restart intervals
        if (!realtimeConnectedRef.current) startFastInterval()
        startSlowInterval()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Also refresh on window focus (covers alt-tab without visibility change)
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

  // Dynamic agent ordering: Bjorn first, active coding agents second, rest by sort_order
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

  return (
    <div>
      {backendError && <BackendErrorBanner label={backendError} />}
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px',
        animation: 'fadeInUp 0.5s var(--ease-spring) both', flexShrink: 0,
      }}>
        <div>
          <PageHeader defaultTitle="Dashboard" defaultSubtitle="system overview · realtime" />
          {_demo && <DemoBadge />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {subagentsError && (
            <span style={{
              fontSize: '11px', color: 'var(--amber)',
              fontFamily: "'JetBrains Mono', monospace",
              padding: '4px 10px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              borderRadius: '8px',
            }}>
              stale
            </span>
          )}
          <span aria-live="polite" style={{
            fontSize: '11px', color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
            padding: '4px 10px',
            background: 'var(--bg-white-03)',
            borderRadius: '8px',
          }}>
            <SecondsAgo sinceMs={lastRefreshMs} />
          </span>
          <button
            onClick={() => { fastTick(); slowTick() }}
            style={{
              background: 'var(--hover-bg)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              color: 'var(--text-secondary)',
              padding: '7px 14px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', fontWeight: 500,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Grid: responsive cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'min-content', gap: '16px' }}>
        <AgentStatusCard mounted={mounted} status={status} />
        <HeartbeatCard mounted={mounted} heartbeat={heartbeat} />
        <AgentsCard mounted={mounted} sortedAgents={sortedAgents} agentsData={agentsData} subagents={subagents} activeSubagents={activeSubagents} />
        <MissionsCard mounted={mounted} missions={missions} updateMissionStatus={updateMissionStatus} deleteMission={deleteMission} />
        <MemoryCard mounted={mounted} memory={memory} />
        <IdeaBriefingCard pendingIdeas={pendingIdeas} onIdeaAction={handleIdeaAction} onOpenDetail={setPanelIdea} />
        <NetworkCard />
        <SessionsCard mounted={mounted} sessions={sessions} />
      </div>

      {/* ── Idea Detail Side Panel ── */}
      {panelIdea && (
        <IdeaDetailPanel idea={panelIdea} onClose={() => setPanelIdea(null)} onIdeaAction={handleIdeaAction} />
      )}
    </div>
  )
}
