'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Activity, Brain, MessageSquare, Bot, RefreshCw, Cpu, Wifi, CheckSquare, Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"

interface StatusData {
  name: string; emoji: string; model: string; status: string; lastActive: string; host: string; ip: string;
}
interface HeartbeatData { lastCheck: string | null; status: string; tasks: string[]; }
interface MemoryEntry { date: string; preview: string; path: string; }
interface Session { id: string; label?: string; kind?: string; lastActive?: string; }
interface Todo { id: string; text: string; done: boolean; createdAt: string; }
interface Mission { id: string; title: string; assignee: string; status: string; createdAt: string; }
interface AgentInfo { id: string; display_name: string; emoji: string; model: string; role: string; status: string; current_task: string | null; }
interface AgentsData { agents: AgentInfo[]; activeSessions: string[]; }
interface SubagentData { count: number; agents: unknown[]; }
interface ProxmoxVM { vmid: number; name: string; status: string; cpuPercent: number; memUsedGB: number; memTotalGB: number; node: string; }
interface ProxmoxNodeStat { node: string; cpuPercent: number; memUsedGB: number; memTotalGB: number; memPercent: number; }
interface ActiveSubagentTask { id: string; label: string; agentId: string; startedAt: string; }
interface ActiveSubagentData { active: boolean; count: number; tasks: ActiveSubagentTask[]; }
interface OPNsenseData { wanIn: string; wanOut: string; updateAvailable: boolean; version: string; }

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Pill color per mission status
function missionStatusStyle(status: string): React.CSSProperties {
  if (status === 'done')   return { background: 'var(--green)', color: '#fff' }
  if (status === 'active') return { background: 'var(--accent-blue)', color: '#fff' }
  return { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }
}

const skeletonStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-panel) 50%, var(--bg-elevated) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: '6px',
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
        <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border)' }}>
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
  const [todos, setTodos]             = useState<Todo[]>([])
  const [todoInput, setTodoInput]     = useState('')
  const [missions, setMissions]       = useState<Mission[]>([])
  const [missionInput, setMissionInput] = useState('')
  const [missionAssignee, setMissionAssignee] = useState('team')
  const [agentsData, setAgentsData]   = useState<AgentsData | null>(null)
  const [proxmoxVMs, setProxmoxVMs]       = useState<ProxmoxVM[]>([])
  const [proxmoxNodes, setProxmoxNodes]   = useState<ProxmoxNodeStat[]>([])
  const [activeSubagents, setActiveSubagents] = useState<ActiveSubagentData>({ active: false, count: 0, tasks: [] })
  const [opnsense, setOpnsense]           = useState<OPNsenseData | null>(null)
  const [lastRefresh, setLastRefresh]     = useState<Date>(new Date())
  const [mounted, setMounted]             = useState(false)
  const mountedRef                        = useRef(false)
  const researchMissionIdRef = useRef<string | null>(null)
  const cacheDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchTodos = useCallback(() => {
    fetch('/api/todos').then(r => r.json()).then(d => setTodos(d.todos || [])).catch(() => {})
  }, [])

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

  // Real-time subscriptions for todos and missions
  useEffect(() => {
    fetchTodos()
    fetchMissions()

    const todosChannel = supabase
      .channel('todos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => fetchTodos())
      .subscribe()

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
      supabase.removeChannel(todosChannel)
      supabase.removeChannel(missionsChannel)
      supabase.removeChannel(agentsSub)
    }
  }, [fetchTodos, fetchMissions])

  // Apply cache rows into state (used by both polling and realtime)
  const applyCache = useCallback((cacheRows: Array<{ key: string; value: unknown }>) => {
    const cm = Object.fromEntries(cacheRows.map((r) => [r.key, r.value]))
    if (cm.status) setStatus(cm.status as StatusData)
    if (cm.heartbeat) setHeartbeat(cm.heartbeat as HeartbeatData)
    if (cm.sessions) setSessions(((cm.sessions as { sessions?: Session[] }).sessions) || [])
    if (cm.subagents) setSubagents(cm.subagents as SubagentData)
    if (cm.agents) setAgentsData(cm.agents as AgentsData)
    if (cm.proxmox) {
      const newVMs = ((cm.proxmox as { vms?: ProxmoxVM[] }).vms) ?? []
      if (newVMs.length > 0) {
        setProxmoxVMs(newVMs)
        setProxmoxNodes(((cm.proxmox as { nodeStats?: ProxmoxNodeStat[] }).nodeStats) ?? [])
      }
    }
    if (!mountedRef.current) {
      mountedRef.current = true
      setMounted(true)
    }
  }, [])

  // Trigger server cache-refresh then read back
  const triggerCacheRefresh = useCallback(async () => {
    try {
      await fetch('/api/cache-refresh', { method: 'POST' })
      const { data: cacheRows } = await supabase.from('cache').select('*')
      if (cacheRows) applyCache(cacheRows)
    } catch { /* silent */ }
  }, [applyCache])

  // Poll cache every 5s (fast) + 30s (slow) + realtime subscription + focus/visibility refresh
  useEffect(() => {
    // First: read stale cache immediately (fast — shows data before refresh completes)
    supabase.from('cache').select('*').then(({ data }: { data: Array<{ key: string; value: unknown }> | null }) => {
      if (data?.length) applyCache(data)
    })
    // Then: trigger refresh in background — realtime subscription will push fresh data
    fetch('/api/cache-refresh', { method: 'POST' })
    fetch('/api/cache-refresh-slow', { method: 'POST' })
    const fastInterval = setInterval(triggerCacheRefresh, 5000)
    const slowInterval = setInterval(() => {
      fetch('/api/cache-refresh-slow', { method: 'POST' })
    }, 30000)

    // Realtime: when server writes cache, debounce to wait for all upserts to land
    const cacheChannel = supabase
      .channel('cache-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cache' }, () => {
        if (cacheDebounceRef.current) clearTimeout(cacheDebounceRef.current)
        cacheDebounceRef.current = setTimeout(() => {
          supabase.from('cache').select('*').then(({ data }: { data: Array<{ key: string; value: unknown }> | null }) => {
            if (data) applyCache(data)
          })
        }, 200)
      })
      .subscribe()

    // Refresh on page focus / tab visibility
    const onFocus = () => { triggerCacheRefresh() }
    const onVisibility = () => { if (!document.hidden) onFocus() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(fastInterval)
      clearInterval(slowInterval)
      supabase.removeChannel(cacheChannel)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [triggerCacheRefresh, applyCache])

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

  const fetchOpnsense = useCallback(async () => {
    try {
      const data = await fetch('/api/opnsense').then(r => r.json())
      setOpnsense(data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchOpnsense()
    const interval = setInterval(fetchOpnsense, 10000)
    return () => clearInterval(interval)
  }, [fetchOpnsense])

  // Research cron → mission sync
  const syncResearchMission = useCallback(async () => {
    try {
      const { jobs } = await fetch('/api/crons').then(r => r.json()).catch(() => ({ jobs: [] }))
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

      const { missions: missionList } = await fetch('/api/missions').then(r => r.json()).catch(() => ({ missions: [] }))
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

  // Auto-missions: sync claude processes every 15s
  useEffect(() => {
    const syncAndFetch = () => {
      fetch('/api/missions/sync-agents', { method: 'POST' })
        .then(() => supabase.from('missions').select('*').order('created_at').neq('status', 'done'))
        .then(r => {
          const missions = r.data || []
          const seen = new Set<string>()
          const deduped = missions.filter((m: Mission) => {
            const key = m.title.toLowerCase().slice(0, 40)
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          setMissions(deduped)
        })
        .catch(() => {})
    }
    syncAndFetch()
    const interval = setInterval(syncAndFetch, 15000)
    return () => clearInterval(interval)
  }, [])

  const [secondsAgo, setSecondsAgo] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [lastRefresh])

  const addTodo = async () => {
    if (!todoInput.trim()) return
    await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: todoInput }) })
    setTodoInput('')
  }
  const toggleTodo = async (id: string, done: boolean) => {
    await fetch('/api/todos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, done: !done }) })
  }
  const deleteTodo = async (id: string) => {
    await fetch('/api/todos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  }
  const addMission = async () => {
    if (!missionInput.trim()) return
    await fetch('/api/missions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: missionInput, assignee: missionAssignee }) })
    setMissionInput('')
  }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            system overview · realtime
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            refreshed {secondsAgo}s ago
          </span>
          <button
            onClick={() => { fetchAll(); triggerCacheRefresh() }}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-secondary)', padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
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
                  <span className="badge badge-green">
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(agentsData?.agents || []).map(agent => {
                const isMain = agent.id === 'main'
                const isCodingWorking = agent.id === 'coding' && activeSubagents.active
                const isActive = agent.status === 'active' || isCodingWorking || (agentsData?.activeSessions || []).some(s => s.includes(agent.id))
                const isMainWorking = isMain && isActive

                const badge = (isMain && !isMainWorking)
                  ? { cls: 'badge-green', dot: 'var(--green)', label: 'Online', pulse: true }
                  : isActive
                  ? { cls: 'badge-blue', dot: 'var(--accent-blue)', label: 'Working', pulse: true }
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
                    <span className={`badge ${badge.cls}`}>
                      <span style={{
                        display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', marginRight: '5px',
                        background: badge.dot,
                        animation: badge.pulse ? 'pulse-dot 1.2s infinite' : 'none',
                      }} />
                      {badge.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Missions — pending=gray, active=BLUE, done=GREEN ── */}
        <div className="card" style={{ padding: '20px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Target size={14} style={{ color: 'var(--red-bright)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Missions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px', maxHeight: '240px', overflowY: 'auto' }}>
            {!mounted ? (
              <SkeletonRows count={3} />
            ) : missions.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No missions assigned</div>
            ) : missions.map(m => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                background: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border)',
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
                    fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: 'none',
                    cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize',
                    transition: 'opacity 0.15s',
                    ...missionStatusStyle(m.status),
                  }}
                >{m.status}</button>
                <button onClick={() => deleteMission(m.id)} className="btn-delete">✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={missionInput}
              onChange={e => setMissionInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addMission()}
              placeholder="New mission..."
              style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' }}
            />
            <select
              value={missionAssignee}
              onChange={e => setMissionAssignee(e.target.value)}
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="team">team</option>
              <option value="bjorn">bjorn</option>
              <option value="devstral">devstral</option>
              <option value="deep">deep</option>
            </select>
            <button onClick={addMission} style={{ background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add</button>
          </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {memory.map((entry) => (
                <div key={entry.date} style={{ padding: '8px 10px', background: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div className="mono" style={{ color: 'var(--accent-bright)', fontSize: '11px', marginBottom: '3px' }}>{entry.date}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {entry.preview || <em style={{ color: 'var(--text-muted)' }}>empty</em>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Sessions — BLUE ── */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <MessageSquare size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sessions</span>
          </div>
          {!mounted ? (
            <SkeletonRows count={3} />
          ) : sessions.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No sessions found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sessions.slice(0, 5).map((s) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', background: 'var(--bg-base)',
                  borderRadius: '6px', border: '1px solid var(--border)',
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{s.label || s.id}</div>
                    {s.kind && <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.kind}</div>}
                  </div>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--blue-bright)' }}>
                    {s.lastActive ? timeAgo(s.lastActive) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── To-Do — GREEN theme ── */}
        <div className="card" style={{ padding: '20px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <CheckSquare size={14} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>To-Do</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
            {!mounted ? (
              <SkeletonRows count={3} />
            ) : todos.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No todos yet</div>
            ) : todos.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                background: 'var(--bg-base)', borderRadius: '6px',
                border: `1px solid ${t.done ? 'rgba(59,165,92,0.2)' : 'var(--border)'}`,
              }}>
                <input
                  type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id, t.done)}
                  style={{ cursor: 'pointer', accentColor: 'var(--green)' }}
                />
                <span style={{
                  flex: 1, fontSize: '12px',
                  color: t.done ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: t.done ? 'line-through' : 'none',
                }}>{t.text}</span>
                <button onClick={() => deleteTodo(t.id)} className="btn-delete">✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={todoInput}
              onChange={e => setTodoInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
              placeholder="Add a task..."
              style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' }}
            />
            <button onClick={addTodo} style={{ background: 'var(--green)', border: 'none', borderRadius: '6px', color: '#fff', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        {/* ── Proxmox VMs — GREEN running, GRAY stopped ── */}
        <div className="card" style={{ padding: '20px', maxHeight: '320px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Cpu size={14} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Proxmox VMs</span>
            {proxmoxVMs.length > 0 && (
              <span className="badge badge-green" style={{ marginLeft: 'auto' }}>
                {proxmoxVMs.filter(v => v.status === 'running').length}/{proxmoxVMs.length} running
              </span>
            )}
          </div>
          {!mounted ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              {/* Node resource summary bars */}
              {proxmoxNodes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '10px', background: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  {proxmoxNodes.map(n => {
                    const cpuColor = n.cpuPercent >= 85 ? 'var(--red-bright)' : n.cpuPercent >= 60 ? '#f5a623' : 'var(--green)'
                    const memColor = n.memPercent >= 85 ? 'var(--red-bright)' : n.memPercent >= 60 ? '#f5a623' : 'var(--green)'
                    return (
                      <div key={n.node}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.node}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', width: '28px' }}>CPU</span>
                            <div style={{ flex: 1, height: '5px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${n.cpuPercent}%`, height: '100%', background: cpuColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                            </div>
                            <span className="mono" style={{ fontSize: '10px', color: cpuColor, width: '32px', textAlign: 'right' }}>{n.cpuPercent}%</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', width: '28px' }}>RAM</span>
                            <div style={{ flex: 1, height: '5px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${n.memPercent}%`, height: '100%', background: memColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                            </div>
                            <span className="mono" style={{ fontSize: '10px', color: memColor, width: '32px', textAlign: 'right' }}>{n.memPercent}%</span>
                          </div>
                          <div style={{ paddingLeft: '36px' }}>
                            <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{n.memUsedGB}/{n.memTotalGB} GB</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {proxmoxVMs.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No VMs found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
                  {proxmoxVMs.map(vm => (
                    <div key={vm.vmid} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px',
                      background: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {vm.name}
                        </div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {vm.node} · #{vm.vmid}
                        </div>
                      </div>
                      <span className={`badge ${vm.status === 'running' ? 'badge-green' : 'badge-gray'}`}>
                        {vm.status}
                      </span>
                      {vm.status === 'running' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', minWidth: '80px' }}>
                          <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            CPU {vm.cpuPercent}%
                          </div>
                          <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            RAM {vm.memUsedGB}/{vm.memTotalGB}G
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── OPNsense — BLUE out, GREEN in ── */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Wifi size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>OPNsense</span>
            {opnsense?.version && opnsense.version !== '—' && (
              <span className="mono" style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>v{opnsense.version}</span>
            )}
          </div>
          {!mounted ? (
            <div>
              <Skeleton width="100%" height="44px" />
              <Skeleton width="100%" height="44px" />
              <Skeleton width="120px" height="20px" mb="0" />
            </div>
          ) : (
            <>
              {/* WAN bandwidth */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>WAN ↓ in</span>
                  <span className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--green)' }}>{opnsense?.wanIn ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>WAN ↑ out</span>
                  <span className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-blue)' }}>{opnsense?.wanOut ?? '—'}</span>
                </div>
              </div>
              {/* Firmware status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Firmware</span>
                {opnsense === null ? (
                  <span className="badge badge-gray">Checking…</span>
                ) : opnsense.updateAvailable ? (
                  <span className="badge" style={{ background: 'rgba(245,166,35,0.15)', color: '#f5a623', border: '1px solid rgba(245,166,35,0.3)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: 600 }}>
                    ⚠ Update available
                  </span>
                ) : (
                  <span className="badge badge-green">✓ Up to date</span>
                )}
              </div>
            </>
          )}
        </div>

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

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
