


import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AGENT_STATUS, MISSION_STATUS } from '@/lib/constants'

const API_BASE = 'http://127.0.0.1:3000'

interface Agent {
  id: string
  display_name: string
  emoji: string
  role: string
  status: string
  current_task: string | null
  color: string | null
  model: string | null
}

interface Mission {
  id: string
  title: string
  assignee: string
  status: string
  progress: number
}

interface Process {
  pid: string
  cmd: string
  cpu: string
  mem: string
  elapsed: string
  logFile: string | null
  agentName: string | null
  agentEmoji: string | null
  lastLogLine: string | null
  mission_id: string | null
  mission_title: string | null
  started_at: string | null
}

const pulseKeyframes = `
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}
`

function StatusDot({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: active ? '#4ade80' : '#71717a',
      animation: active ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
      flexShrink: 0,
    }} />
  )
}

interface AgentCardProps {
  agent: Agent
  onSave: (id: string, fields: { display_name: string; emoji: string; role: string; model: string }) => Promise<void>
  activeMission?: Mission | null
}

function AgentCard({ agent, onSave, activeMission }: AgentCardProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(agent.display_name)
  const [emoji, setEmoji] = useState(agent.emoji)
  const [role, setRole] = useState(agent.role)
  const [model, setModel] = useState(agent.model ?? '')
  const [saving, setSaving] = useState(false)

  const active = agent.status === AGENT_STATUS.ACTIVE
  const awaitingDeploy = agent.status === AGENT_STATUS.AWAITING_DEPLOY

  async function handleSave() {
    setSaving(true)
    await onSave(agent.id, { display_name: name, emoji, role, model })
    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    setName(agent.display_name)
    setEmoji(agent.emoji)
    setRole(agent.role)
    setModel(agent.model ?? '')
    setEditing(false)
  }

  return (
    <div style={{
      background: 'rgba(22, 22, 28, 0.65)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: `1px solid ${active ? 'rgba(74,222,128,0.3)' : awaitingDeploy ? 'rgba(250,204,21,0.35)' : 'var(--accent)44'}`,
      borderRadius: '16px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transition: 'border-color 0.3s',
    }}>
      {editing ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            style={{
              width: '48px', fontSize: '28px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '4px', textAlign: 'center',
            }}
          />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              flex: 1, fontSize: '16px', fontWeight: 700,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '6px 10px', color: 'var(--text-primary)',
            }}
          />
        </div>
      ) : (
        <div style={{ fontSize: '40px', lineHeight: 1 }}>{agent.emoji}</div>
      )}

      <div>
        {!editing && (
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {agent.display_name}
          </div>
        )}

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="Role"
              style={{
                fontSize: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '5px 8px', color: 'var(--text-primary)',
              }}
            />
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="Model (e.g. claude-sonnet-4-6)"
              style={{
                fontSize: '11px', fontFamily: 'monospace',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '5px 8px', color: 'var(--text-secondary)',
              }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '10px', fontWeight: 600, color: 'var(--accent-bright)',
              background: 'rgba(155,132,236,0.12)', border: '1px solid rgba(155,132,236,0.25)',
              borderRadius: '4px', padding: '2px 8px',
            }}>
              {agent.role}
            </span>
            {agent.model && (
              <span style={{
                fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)',
                background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '2px 7px',
              }}>
                {agent.model}
              </span>
            )}
          </div>
        )}
      </div>

      <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {awaitingDeploy ? (
          <span style={{
            fontSize: '11px', fontWeight: 700,
            color: '#facc15',
            background: 'rgba(250,204,21,0.12)',
            border: '1px solid rgba(250,204,21,0.35)',
            borderRadius: '10px', padding: '2px 8px',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }}>
            Awaiting Deploy
          </span>
        ) : (
          <>
            <StatusDot active={active} />
            <span style={{ fontSize: '11px', color: active ? '#4ade80' : '#8b8fa3', fontWeight: 600 }}>
              {active ? 'Working' : 'Idle'}
            </span>
          </>
        )}
      </div>

      {agent.current_task && (
        <p style={{ margin: 0, fontSize: '12px', color: active ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.5, wordBreak: 'break-word', fontStyle: active ? 'normal' : 'italic' }}>
          {active ? '' : 'Last: '}{agent.current_task}
        </p>
      )}

      {active && activeMission && activeMission.progress > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${activeMission.progress}%`,
              borderRadius: '3px',
              background: 'var(--accent-blue, #3b82f6)',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {activeMission.title} · {activeMission.progress}%
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        {editing ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                fontSize: '11px', padding: '4px 12px', borderRadius: '10px',
                border: 'none', background: 'var(--accent)', color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              style={{
                fontSize: '11px', padding: '4px 12px', borderRadius: '10px',
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={{
              fontSize: '11px', padding: '4px 12px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  )
}

function LiveProcesses({ agents }: { agents: Agent[] }) {
  const [processes, setProcesses] = useState<Process[]>([])
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployLog, setDeployLog] = useState<string | null>(null)
  const [deployOk, setDeployOk] = useState(false)
  const lastPidHashRef = useRef('')

  const hasAwaitingDeploy = agents.some(a => a.status === AGENT_STATUS.AWAITING_DEPLOY)

  async function handleDeploy() {
    setDeploying(true)
    setDeployLog(null)
    try {
      const res = await fetch(`${API_BASE}/api/deploy`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setDeployOk(true)
        setDeployLog('Deploy successful')
      } else {
        setDeployOk(false)
        setDeployLog(data.error || 'Deploy failed')
      }
    } catch (e) {
      setDeployOk(false)
      setDeployLog(e instanceof Error ? e.message : 'Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  async function fetchProcesses() {
    try {
      const res = await fetch(`${API_BASE}/api/processes`)
      const data = await res.json()
      const incoming: Process[] = data.processes ?? []
      // Only update state if process data actually changed (avoid no-op re-renders)
      const pidHash = incoming.map(p => `${p.pid}:${p.cpu}:${p.mem}`).join('|')
      if (pidHash !== lastPidHashRef.current) {
        lastPidHashRef.current = pidHash
        setProcesses(incoming)
        setLastFetch(new Date())
      }
    } catch {
      setProcesses([])
    } finally {
      setInitialized(true)
    }
  }

  useEffect(() => {
    fetchProcesses()
    const interval = setInterval(fetchProcesses, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      background: 'rgba(22, 22, 28, 0.65)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Live Processes
          </div>
          {processes.length > 0 && (
            <span style={{
              fontSize: '10px', fontWeight: 700,
              background: 'rgba(74,222,128,0.15)', color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: '10px', padding: '1px 7px',
            }}>
              {processes.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasAwaitingDeploy && (
            <button
              onClick={handleDeploy}
              disabled={deploying}
              style={{
                fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '10px',
                border: '1px solid rgba(250,204,21,0.5)',
                background: deploying ? 'rgba(250,204,21,0.1)' : 'rgba(250,204,21,0.15)',
                color: '#facc15', cursor: deploying ? 'not-allowed' : 'pointer',
                opacity: deploying ? 0.7 : 1,
              }}
            >
              {deploying ? 'Deploying…' : 'Deploy'}
            </button>
          )}
          <div aria-live="polite" style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            {lastFetch ? `updated ${lastFetch.toLocaleTimeString()}` : 'loading…'}
          </div>
        </div>
      </div>
      {deployLog && (
        <div style={{
          fontSize: '11px', fontFamily: 'monospace', padding: '6px 10px',
          borderRadius: '10px', marginBottom: '10px',
          background: deployOk ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          color: deployOk ? '#4ade80' : '#f87171',
          border: `1px solid ${deployOk ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {deployOk ? '' : ''} {deployLog}
        </div>
      )}

      {!initialized ? (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading…</p>
      ) : processes.length === 0 ? (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active processes</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {processes.map((p, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', gap: '4px',
              padding: '10px 12px', borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(74,222,128,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                  background: '#4ade80', animation: 'pulse-dot 1.5s ease-in-out infinite', flexShrink: 0,
                }} />
                {p.agentEmoji && (
                  <span style={{ fontSize: '14px' }}>{p.agentEmoji}</span>
                )}
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.agentName ?? 'claude'}
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  pid {p.pid}
                </span>
              </div>
              {p.mission_title && (
                <div style={{
                  fontSize: '11px', color: 'var(--text-secondary)',
                  paddingLeft: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.mission_title.length > 40 ? p.mission_title.slice(0, 40) + '…' : p.mission_title}
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', fontFamily: 'monospace', fontSize: '10px', paddingLeft: '16px' }}>
                <span style={{ color: '#4ade80' }}>cpu {p.cpu}%</span>
                <span style={{ color: 'var(--text-secondary)' }}>mem {p.mem}%</span>
                {p.elapsed && <span style={{ color: 'var(--text-muted)' }}>{p.elapsed}</span>}
              </div>
              {p.lastLogLine && (
                <div style={{
                  fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)',
                  paddingLeft: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.lastLogLine}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AgentsPage() {
  const queryClient = useQueryClient()

  const { data: agentsData, isLoading: loading } = useQuery<{ agents: Agent[] }>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/agents`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
  })

  const { data: missionsData } = useQuery<{ missions: Mission[] }>({
    queryKey: ['missions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/missions`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
  })

  const agents = agentsData?.agents ?? []
  const missions = missionsData?.missions ?? []

  const saveMutation = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: { display_name: string; emoji: string; role: string; model: string } }) => {
      const res = await fetch(`${API_BASE}/api/agents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  async function handleSave(id: string, fields: { display_name: string; emoji: string; role: string; model: string }) {
    await saveMutation.mutateAsync({ id, fields })
  }

  // Real-time subscription (only when supabase client is available)
  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel('agents-realtime')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Agents
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            Your AI workforce · real-time
          </p>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</p>
        ) : (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
              Permanent
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {agents.map(agent => {
                const activeMission = missions.find(
                  m => m.status === MISSION_STATUS.ACTIVE && m.assignee === agent.id
                ) ?? null
                return (
                  <AgentCard key={agent.id} agent={agent} onSave={handleSave} activeMission={activeMission} />
                )
              })}
            </div>
          </div>
        )}

        <LiveProcesses agents={agents} />
      </div>
    </>
  )
}
