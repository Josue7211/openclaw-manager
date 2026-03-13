

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Activity, Brain, MessageSquare, Bot, RefreshCw, Cpu, Wifi, Target, Lightbulb, X, CheckCircle, SkipForward, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { timeAgo, formatTime } from '@/lib/utils'

interface StatusData {
  name: string; emoji: string; model: string; status: string; lastActive: string; host: string; ip: string;
}
interface HeartbeatData { lastCheck: string | null; status: string; tasks: string[]; }
interface MemoryEntry { date: string; preview: string; path: string; }
interface Session { id: string; label?: string; kind?: string; lastActive?: string; }
interface Mission { id: string; title: string; assignee: string; status: string; createdAt: string; }
interface AgentInfo { id: string; display_name: string; emoji: string; model: string; role: string; status: string; current_task: string | null; sort_order?: number; }
interface AgentsData { agents: AgentInfo[]; activeSessions: string[]; }
interface SubagentData { count: number; agents: unknown[]; }
interface ActiveSubagentTask { id: string; label: string; agentId: string; startedAt: string; }
interface ActiveSubagentData { active: boolean; count: number; tasks: ActiveSubagentTask[]; }
interface Idea { id: string; title: string; description: string | null; why: string | null; effort: string | null; impact: string | null; category: string | null; status: string; created_at: string; }

// Isolated timer component — prevents full dashboard re-render every second
function SecondsAgo({ sinceMs }: { sinceMs: number }) {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setS(Math.floor((Date.now() - sinceMs) / 1000)), 1000)
    return () => clearInterval(t)
  }, [sinceMs])
  return <>{s}s ago</>
}

// Pill color per mission status
function missionStatusStyle(status: string): React.CSSProperties {
  if (status === 'done')   return { background: 'rgba(52, 211, 153, 0.2)', color: 'var(--green-bright)', border: '1px solid rgba(52, 211, 153, 0.25)' }
  if (status === 'active') return { background: 'rgba(129, 140, 248, 0.2)', color: 'var(--blue-bright)', border: '1px solid rgba(129, 140, 248, 0.25)' }
  return { background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
}

const skeletonStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: '8px',
  height: '16px',
  marginBottom: '8px',
}

function Skeleton({ width = '100%', height = '16px', mb = '8px' }: { width?: string; height?: string; mb?: string }) {
  return <div style={{ ...skeletonStyle, width, height, marginBottom: mb }} />
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border)', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}>
          <Skeleton width={`${60 + (i % 3) * 15}%`} mb="4px" />
          <Skeleton width={`${40 + (i % 2) * 20}%`} height="11px" mb="0" />
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [status, setStatus]           = useState<StatusData | null>(null)
  const [heartbeat, setHeartbeat]     = useState<HeartbeatData | null>(null)
  const [memory, setMemory]           = useState<MemoryEntry[]>([])
  const [sessions, setSessions]       = useState<Session[]>([])
  const [subagents, setSubagents]     = useState<SubagentData | null>(null)
  const [missions, setMissions]       = useState<Mission[]>([])
  const [agentsData, setAgentsData]   = useState<AgentsData | null>(null)
  const [activeSubagents, setActiveSubagents] = useState<ActiveSubagentData>({ active: false, count: 0, tasks: [] })
  const [lastRefresh, setLastRefresh]     = useState<Date>(new Date())
  const [mounted, setMounted]             = useState(false)
  const mountedRef                        = useRef(false)
  const researchMissionIdRef = useRef<string | null>(null)
  const cacheDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchMissions = useCallback(() => {
    fetch('/api/missions').then(r => r.json()).then(d => {
      const filtered = (d.missions || []).filter((m: Mission) => m.status !== 'done')
      const seen = new Set<string>()
      const deduped = filtered.filter((m: Mission) => {
        const key = m.title.toLowerCase().slice(0, 40)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setMissions(deduped)
    }).catch(() => {})
  }, [])

  const fetchAll = useCallback(() => {
    fetch('/api/memory').then(r => r.json()).then(d => setMemory(d.entries || [])).catch(() => {})
    setLastRefresh(new Date())
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [fetchAll])

  // Real-time subscriptions for missions and agents (only when supabase client is available)
  useEffect(() => {
    fetchMissions()

    if (!supabase) return

    const missionsChannel = supabase
      .channel('missions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => fetchMissions())
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

    return () => {
      supabase.removeChannel(missionsChannel)
      supabase.removeChannel(agentsSub)
    }
  }, [fetchMissions])

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

  // Read cache — via Supabase client if available, otherwise via API route
  const readCache = useCallback(async () => {
    if (supabase) {
      const { data } = await supabase.from('cache').select('*')
      return data as Array<{ key: string; value: unknown }> | null
    }
    const res = await fetch('/api/cache')
    const json = await res.json()
    return (json.rows || null) as Array<{ key: string; value: unknown }> | null
  }, [])

  // Trigger server cache-refresh then read back
  const triggerCacheRefresh = useCallback(async () => {
    try {
      await fetch('/api/cache-refresh', { method: 'POST' })
      const cacheRows = await readCache()
      if (cacheRows) applyCache(cacheRows)
    } catch { /* silent */ }
  }, [applyCache, readCache])

  // Poll cache every 5s (fast) + 30s (slow) + realtime subscription + focus/visibility refresh
  useEffect(() => {
    // First: read stale cache immediately (fast — shows data before refresh completes)
    readCache().then((data) => {
      if (data?.length) applyCache(data)
    })
    // Then: trigger refresh in background
    fetch('/api/cache-refresh', { method: 'POST' })
    fetch('/api/cache-refresh-slow', { method: 'POST' })
    const fastInterval = setInterval(triggerCacheRefresh, 5000)
    const slowInterval = setInterval(() => {
      fetch('/api/cache-refresh-slow', { method: 'POST' })
    }, 30000)

    // Realtime: when server writes cache, debounce to wait for all upserts to land (only with supabase)
    let cacheChannel: ReturnType<typeof supabase.channel> | null = null
    if (supabase) {
      cacheChannel = supabase
        .channel('cache-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cache' }, () => {
          if (cacheDebounceRef.current) clearTimeout(cacheDebounceRef.current)
          cacheDebounceRef.current = setTimeout(() => {
            readCache().then((data) => {
              if (data) applyCache(data)
            })
          }, 200)
        })
        .subscribe()
    }

    // Refresh on page focus / tab visibility
    const onFocus = () => { triggerCacheRefresh() }
    const onVisibility = () => { if (!document.hidden) onFocus() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(fastInterval)
      clearInterval(slowInterval)
      if (cacheChannel) supabase.removeChannel(cacheChannel)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [triggerCacheRefresh, applyCache, readCache])

  const fetchActiveSubagents = useCallback(async () => {
    try {
      const data = await fetch('/api/subagents/active').then(r => r.json())
      setActiveSubagents(data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchActiveSubagents()
    const interval = setInterval(fetchActiveSubagents, 10000)
    return () => clearInterval(interval)
  }, [fetchActiveSubagents])

  // Research cron → mission sync
  const syncResearchMission = useCallback(async () => {
    try {
      const [{ jobs }, { missions: missionList }] = await Promise.all([
        fetch('/api/crons').then(r => r.json()).catch(() => ({ jobs: [] })),
        fetch('/api/missions').then(r => r.json()).catch(() => ({ missions: [] })),
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
          const created = await fetch('/api/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Research', assignee: 'bjorn' }),
          }).then(r => r.json()).catch(() => null)
          if (created?.mission?.id) researchMissionIdRef.current = created.mission.id
        } else {
          if (!researchMissionIdRef.current) researchMissionIdRef.current = existing.id
          if (existing.status !== 'active') {
            await fetch('/api/missions', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: existing.id, status: 'active' }),
            }).catch(() => {})
          }
        }
      } else if (lastStatus === 'success' || (lastRun > 0 && !seemsRunning)) {
        const targetId = researchMissionIdRef.current ?? existing?.id
        if (existing && existing.status === 'active' && targetId) {
          await fetch('/api/missions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: targetId, status: 'done' }),
          }).catch(() => {})
        }
      }

      // Real-time subscription handles missions refresh
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    syncResearchMission()
    const interval = setInterval(syncResearchMission, 30000)
    return () => clearInterval(interval)
  }, [syncResearchMission])

  // Auto-missions: sync claude processes every 15s (realtime subscription handles state refresh)
  useEffect(() => {
    fetch('/api/missions/sync-agents', { method: 'POST' }).catch(() => {})
    const interval = setInterval(() => {
      fetch('/api/missions/sync-agents', { method: 'POST' }).catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const [pendingIdeas, setPendingIdeas] = useState<Idea[]>([])
  const [panelIdea, setPanelIdea] = useState<Idea | null>(null)

  const fetchPendingIdeas = useCallback(() => {
    fetch('/api/ideas?status=pending')
      .then(r => r.json())
      .then(d => setPendingIdeas(d.ideas || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchPendingIdeas()
    const interval = setInterval(fetchPendingIdeas, 60000)
    return () => clearInterval(interval)
  }, [fetchPendingIdeas])

  const handleIdeaAction = useCallback(async (id: string, status: 'approved' | 'deferred' | 'rejected') => {
    await fetch('/api/ideas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    }).catch(() => {})
    fetchPendingIdeas()
    setPanelIdea(prev => (prev?.id === id ? null : prev))
  }, [fetchPendingIdeas])

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

  const updateMissionStatus = async (id: string, currentStatus: string) => {
    const next = currentStatus === 'pending' ? 'active' : currentStatus === 'active' ? 'done' : 'pending'
    await fetch('/api/missions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: next }) })
  }
  const deleteMission = async (id: string) => {
    await fetch('/api/missions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  }

  return (
    <div>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '32px',
        animation: 'fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)',
            letterSpacing: '-0.03em', lineHeight: 1.2,
          }}>Dashboard</h1>
          <p style={{
            margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.02em',
          }}>
            system overview · realtime
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span aria-live="polite" style={{
            fontSize: '11px', color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
            padding: '4px 10px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
          }}>
            <SecondsAgo sinceMs={lastRefresh.getTime()} />
          </span>
          <button
            onClick={() => { fetchAll(); triggerCacheRefresh() }}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
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

      {/* ── Grid: left = general activity, right = today's sessions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px', alignItems: 'start' }}>

        {/* ── Left Column: General Activity ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>

        {/* ── Agent Status — PURPLE ── */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Activity size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agent Status</span>
          </div>
          {!mounted ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '8px', ...skeletonStyle, marginBottom: 0 }} />
                <div style={{ flex: 1 }}>
                  <Skeleton width="50%" height="20px" mb="10px" />
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <Skeleton width="60px" height="12px" mb="0" />
                    <Skeleton width="80px" height="12px" mb="0" />
                    <Skeleton width="70px" height="12px" mb="0" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span style={{ fontSize: '48px' }}>{status?.emoji || '🦬'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700 }}>{status?.name || 'Bjorn'}</span>
                  {/* Green dot = online signal */}
                  <span className="badge badge-green" aria-live="polite">
                    <span style={{
                      display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
                      background: 'var(--green)', marginRight: '5px',
                      animation: 'pulse-dot 2s infinite',
                    }} />
                    Online
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Model', val: status?.model, color: 'var(--accent-blue)' },
                    { label: 'Host',  val: status?.host,  color: 'var(--text-primary)' },
                    { label: 'IP',    val: status?.ip,    color: 'var(--text-primary)' },
                    { label: 'Last Active', val: timeAgo(status?.lastActive || null), color: 'var(--text-primary)' },
                  ].map(({ label, val, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>{label}</div>
                      <div className="mono" style={{ color }}>{val || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Heartbeat — BLUE header, GREEN ok, RED error ── */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Cpu size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Heartbeat</span>
          </div>
          {!mounted ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <Skeleton width="60px" height="20px" mb="0" />
                <Skeleton width="50px" height="14px" mb="0" />
              </div>
              <Skeleton width="100%" height="14px" />
              <Skeleton width="80%" height="14px" />
              <Skeleton width="90%" height="14px" mb="0" />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span className={`badge ${
                  heartbeat?.status === 'ok' ? 'badge-green'
                  : heartbeat?.status ? 'badge-red'
                  : 'badge-gray'
                }`}>
                  {heartbeat?.status === 'ok' ? '✓ OK' : heartbeat?.status || 'Unknown'}
                </span>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>{formatTime(heartbeat?.lastCheck || null)}</span>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {heartbeat?.tasks && heartbeat.tasks.length > 0 ? (
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tasks</div>
                      {heartbeat.tasks.map((t, i) => (
                        <div key={i} className="mono" style={{ color: 'var(--text-secondary)', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>— {t}</div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active tasks</div>
                  )}
                  <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Last check: {timeAgo(heartbeat?.lastCheck || null)}
                  </div>
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28px', background: 'linear-gradient(to bottom, transparent, var(--bg-card-solid))', pointerEvents: 'none' }} />
              </div>
            </>
          )}
        </div>

        {/* ── Agents — PURPLE ready, BLUE working ── */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agents</span>
            </div>
            {subagents && subagents.count > 0 && (
              <span className="badge badge-blue">{subagents.count} active</span>
            )}
          </div>
          {!mounted ? (
            <SkeletonRows count={3} />
          ) : (
            <div style={{ position: 'relative' }}>
            <div className="hidden-scrollbar" style={{ maxHeight: '280px', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sortedAgents.map(agent => {
                const isMain = agent.id === 'main'
                const isCodingWorking = agent.id === 'coding' && activeSubagents.active
                const isActive = agent.status === 'active' || isCodingWorking || (agentsData?.activeSessions || []).some(s => s.includes(agent.id))
                const isMainWorking = isMain && isActive

                const isAwaitingDeploy = agent.status === 'awaiting_deploy'
                const badge = (isMain && !isMainWorking)
                  ? { cls: 'badge-green', dot: 'var(--green)', label: 'Online', pulse: true }
                  : isActive
                  ? { cls: 'badge-blue', dot: 'var(--accent-blue)', label: 'Working', pulse: true }
                  : isAwaitingDeploy
                  ? { cls: '', dot: '#facc15', label: '⏳ Awaiting Deploy', pulse: true, yellow: true }
                  : { cls: 'badge-purple', dot: 'var(--accent)', label: 'Ready', pulse: false }

                return (
                  <div key={agent.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 10px', background: 'var(--bg-base)',
                    borderRadius: '6px', border: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: '18px' }}>{agent.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{agent.display_name}</div>
                      <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.role} · {agent.model}
                        {isCodingWorking && activeSubagents.tasks[0] && (
                          <span style={{ color: 'var(--accent-blue)' }}> · {timeAgo(activeSubagents.tasks[0].startedAt)}</span>
                        )}
                      </div>
                    </div>
                    {'yellow' in badge && badge.yellow ? (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 7px',
                        borderRadius: '4px',
                        background: 'rgba(250,204,21,0.12)',
                        color: '#facc15',
                        border: '1px solid rgba(250,204,21,0.35)',
                        animation: 'pulse-dot 2s ease-in-out infinite',
                        display: 'inline-flex', alignItems: 'center',
                      }}>
                        {badge.label}
                      </span>
                    ) : (
                      <span className={`badge ${badge.cls}`}>
                        <span style={{
                          display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', marginRight: '5px',
                          background: badge.dot,
                          animation: badge.pulse ? 'pulse-dot 1.2s infinite' : 'none',
                        }} />
                        {badge.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28px', background: 'linear-gradient(to bottom, transparent, var(--bg-card-solid))', pointerEvents: 'none' }} />
            </div>
          )}
        </div>

        {/* ── Missions — pending=gray, active=BLUE, done=GREEN ── */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Target size={14} style={{ color: 'var(--red-bright)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Missions</span>
          </div>
          {!mounted ? (
            <SkeletonRows count={3} />
          ) : (
            <div style={{ position: 'relative' }}>
            <div className="hidden-scrollbar" style={{ maxHeight: '280px', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {missions.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No missions assigned</div>
              ) : missions.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                  background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border)', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                }}>
                  <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-primary)' }}>{m.title}</span>
                  <span style={{
                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                    background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                    textTransform: 'capitalize', fontFamily: 'monospace',
                  }}>{m.assignee}</span>
                  <button
                    onClick={() => updateMissionStatus(m.id, m.status)}
                    style={{
                      fontSize: '10px', padding: '3px 10px', borderRadius: '8px', border: 'none',
                      cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize',
                      transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                      ...missionStatusStyle(m.status),
                    }}
                  >{m.status}</button>
                  <button onClick={() => deleteMission(m.id)} className="btn-delete">✕</button>
                </div>
              ))}
            </div>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28px', background: 'linear-gradient(to bottom, transparent, var(--bg-card-solid))', pointerEvents: 'none' }} />
            </div>
          )}
        </div>

        {/* ── Memory — PURPLE dates ── */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Brain size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Memory</span>
          </div>
          {!mounted ? (
            <SkeletonRows count={3} />
          ) : memory.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No memory files yet</div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {memory.map((entry) => (
                  <div key={entry.date} style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border)', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}>
                    <div className="mono" style={{ color: 'var(--accent-bright)', fontSize: '11px', marginBottom: '3px' }}>{entry.date}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {entry.preview || <em style={{ color: 'var(--text-muted)' }}>empty</em>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28px', background: 'linear-gradient(to bottom, transparent, var(--bg-card-solid))', pointerEvents: 'none' }} />
            </div>
          )}
        </div>

        {/* ── Ideas Briefing ── */}
        {(() => {
          const topIdea = pendingIdeas[0] ?? null
          const pendingCount = pendingIdeas.length
          const effortColor = (v: string | null) =>
            v === 'low' ? 'var(--green)' : v === 'medium' ? '#f59e0b' : v === 'high' ? 'var(--red-bright)' : 'var(--text-muted)'
          const pillStyle = (v: string | null): React.CSSProperties => ({
            display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px',
            fontWeight: 600, background: `${effortColor(v)}22`, color: effortColor(v),
            border: `1px solid ${effortColor(v)}44`, textTransform: 'capitalize',
          })
          return (
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Lightbulb size={14} style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Idea Briefing</span>
                </div>
                {pendingCount > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{pendingCount} pending</span>
                )}
              </div>
              {!topIdea ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No pending ideas — next briefing at 8am
                </div>
              ) : (
                <div>
                  <div
                    onClick={() => setPanelIdea(topIdea)}
                    style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', cursor: 'pointer', lineHeight: 1.3 }}
                  >
                    {topIdea.title}
                  </div>
                  {topIdea.description && (
                    <div style={{
                      fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '10px',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {topIdea.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
                    {topIdea.effort && <span style={pillStyle(topIdea.effort)}>effort: {topIdea.effort}</span>}
                    {topIdea.impact && <span style={pillStyle(topIdea.impact)}>impact: {topIdea.impact}</span>}
                    {topIdea.category && (
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {topIdea.category}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      onClick={() => handleIdeaAction(topIdea.id, 'approved')}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(52, 211, 153, 0.12)', color: 'var(--green)', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    >
                      <CheckCircle size={11} /> Approve
                    </button>
                    <button
                      onClick={() => handleIdeaAction(topIdea.id, 'deferred')}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    >
                      <SkipForward size={11} /> Defer
                    </button>
                    <button
                      onClick={() => handleIdeaAction(topIdea.id, 'rejected')}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(248, 113, 113, 0.12)', color: 'var(--red-bright)', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    >
                      <XCircle size={11} /> Reject
                    </button>
                    <button
                      onClick={() => setPanelIdea(topIdea)}
                      style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--accent-bright)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Read more
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Network — BLUE + GREEN active ── */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Wifi size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Network</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>OpenClaw Gateway</div>
              <div className="mono" style={{ color: 'var(--green-bright)', fontSize: '12px' }}>http://10.0.0.SERVICES:18789</div>
              <span className="badge badge-green" style={{ marginTop: '5px' }}>● Active</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Mission Control</div>
              <div className="mono" style={{ color: 'var(--blue-bright)', fontSize: '12px' }}>http://10.0.0.SERVICES:3000</div>
              <span className="badge badge-blue" style={{ marginTop: '5px' }}>This app</span>
            </div>
          </div>
        </div>

        </div>{/* end Left Column */}

        {/* ── Right Column: Today's Sessions — BLUE ── */}
        <div className="card" style={{ padding: '20px', position: 'sticky', top: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <MessageSquare size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Today&apos;s Sessions</span>
          </div>
          {!mounted ? (
            <SkeletonRows count={3} />
          ) : sessions.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No sessions found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sessions.slice(0, 10).map((s) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', background: 'var(--bg-base)',
                  borderRadius: '6px', border: '1px solid var(--border)',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label || s.id}</div>
                    {s.kind && <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.kind}</div>}
                  </div>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--blue-bright)', flexShrink: 0, marginLeft: '8px' }}>
                    {s.lastActive ? timeAgo(s.lastActive) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Idea Detail Side Panel ── */}
      {panelIdea !== null && (() => {
        const idea = panelIdea
        const effortColor = (v: string | null) =>
          v === 'low' ? 'var(--green)' : v === 'medium' ? '#f59e0b' : v === 'high' ? 'var(--red-bright)' : 'var(--text-muted)'
        const pillStyle = (v: string | null): React.CSSProperties => ({
          display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
          fontWeight: 600, background: `${effortColor(v)}22`, color: effortColor(v),
          border: `1px solid ${effortColor(v)}44`, textTransform: 'capitalize',
        })
        return (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setPanelIdea(null)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200,
                animation: 'fadeIn 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
            {/* Panel */}
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(480px, 90vw)',
              background: 'var(--bg-card-solid)',
              backdropFilter: 'blur(32px) saturate(180%)',
              WebkitBackdropFilter: 'blur(32px) saturate(180%)',
              borderLeft: '1px solid var(--border)',
              zIndex: 201,
              display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              boxShadow: '-20px 0 60px rgba(0, 0, 0, 0.3)',
              overflowY: 'auto',
            }}>
              {/* Panel header */}
              <div style={{
                padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
                position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Lightbulb size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Idea Detail</span>
                </div>
                <button
                  onClick={() => setPanelIdea(null)}
                  aria-label="Close"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', borderRadius: '4px', flexShrink: 0 }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Panel body */}
              <div style={{ padding: '24px', flex: 1 }}>
                <h2 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                  {idea.title}
                </h2>

                {/* Metadata pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
                  {idea.effort && <span style={pillStyle(idea.effort)}>effort: {idea.effort}</span>}
                  {idea.impact && <span style={pillStyle(idea.impact)}>impact: {idea.impact}</span>}
                  {idea.category && (
                    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {idea.category}
                    </span>
                  )}
                </div>

                {/* Description */}
                {idea.description && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Description</div>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{idea.description}</p>
                  </div>
                )}

                {/* Why it fits */}
                {idea.why && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Why it fits your workflow</div>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', borderLeft: '3px solid var(--accent)' }}>{idea.why}</p>
                  </div>
                )}

                {/* Date */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '24px' }}>
                  Generated {new Date(idea.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleIdeaAction(idea.id, 'approved')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '12px', fontWeight: 600, borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'var(--green)', color: '#fff', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)', boxShadow: '0 2px 12px rgba(52, 211, 153, 0.25)' }}
                  >
                    <CheckCircle size={13} /> Approve
                  </button>
                  <button
                    onClick={() => handleIdeaAction(idea.id, 'deferred')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '12px', fontWeight: 600, borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
                  >
                    <SkipForward size={13} /> Defer
                  </button>
                  <button
                    onClick={() => handleIdeaAction(idea.id, 'rejected')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '12px', fontWeight: 600, borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'var(--red)', color: '#fff', transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)', boxShadow: '0 2px 12px rgba(248, 113, 113, 0.25)' }}
                  >
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  )
}
