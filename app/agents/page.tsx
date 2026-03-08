'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

interface Process {
  user: string
  pid: string
  cmd: string
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
      background: active ? '#4ade80' : '#555',
      animation: active ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
      flexShrink: 0,
    }} />
  )
}

interface AgentCardProps {
  agent: Agent
  onSave: (id: string, fields: { display_name: string; emoji: string; role: string; model: string }) => Promise<void>
}

function AgentCard({ agent, onSave }: AgentCardProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(agent.display_name)
  const [emoji, setEmoji] = useState(agent.emoji)
  const [role, setRole] = useState(agent.role)
  const [model, setModel] = useState(agent.model ?? '')
  const [saving, setSaving] = useState(false)

  const active = agent.status === 'active'

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
      background: 'var(--bg-panel)',
      border: `1px solid ${active ? 'rgba(74,222,128,0.3)' : 'var(--accent)44'}`,
      borderRadius: '12px',
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
              borderRadius: '6px', padding: '4px', textAlign: 'center',
            }}
          />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              flex: 1, fontSize: '16px', fontWeight: 700,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)',
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
                borderRadius: '6px', padding: '5px 8px', color: 'var(--text-primary)',
              }}
            />
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="Model (e.g. claude-sonnet-4-6)"
              style={{
                fontSize: '11px', fontFamily: 'monospace',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '5px 8px', color: 'var(--text-secondary)',
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
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '2px 7px',
              }}>
                {agent.model}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <StatusDot active={active} />
        <span style={{ fontSize: '11px', color: active ? '#4ade80' : '#555', fontWeight: 600 }}>
          {active ? '● Working' : 'Idle'}
        </span>
      </div>

      {active && agent.current_task && (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
          {agent.current_task}
        </p>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        {editing ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                fontSize: '11px', padding: '4px 12px', borderRadius: '6px',
                border: 'none', background: 'var(--accent)', color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              style={{
                fontSize: '11px', padding: '4px 12px', borderRadius: '6px',
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
              fontSize: '11px', padding: '4px 12px', borderRadius: '6px',
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

function LiveProcesses() {
  const [processes, setProcesses] = useState<Process[]>([])
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  async function fetchProcesses() {
    try {
      const res = await fetch('/api/processes')
      const data = await res.json()
      setProcesses(data.processes ?? [])
      setLastFetch(new Date())
    } catch {
      setProcesses([])
    }
  }

  useEffect(() => {
    fetchProcesses()
    const interval = setInterval(fetchProcesses, 10000)
    return () => clearInterval(interval)
  }, [])

  if (processes.length === 0) return null

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Subagents
        </div>
        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
          {lastFetch ? `updated ${lastFetch.toLocaleTimeString()}` : 'loading…'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {processes.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              fontFamily: 'monospace', fontSize: '11px',
              padding: '6px 10px', borderRadius: '6px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              <span style={{ color: '#4ade80', fontWeight: 700, minWidth: '20px' }}>●</span>
              <span style={{ color: 'var(--text-muted)', minWidth: '60px' }}>pid {p.pid}</span>
              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.cmd}
              </span>
            </div>
          ))}
        </div>
    </div>
  )
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial fetch
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => { setAgents(data.agents ?? []); setLoading(false) })
      .catch(() => setLoading(false))

    // Real-time subscription
    const channel = supabase
      .channel('agents-realtime')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, (payload: any) => {
        if (payload.eventType === 'UPDATE') {
          setAgents(prev => prev.map(a => a.id === (payload.new as Agent).id ? { ...a, ...(payload.new as Agent) } : a))
        } else if (payload.eventType === 'INSERT') {
          setAgents(prev => [...prev, payload.new as Agent])
        } else if (payload.eventType === 'DELETE') {
          setAgents(prev => prev.filter(a => a.id !== (payload.old as { id: string }).id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleSave(id: string, fields: { display_name: string; emoji: string; role: string; model: string }) {
    const res = await fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    })
    if (res.ok) {
      const { agent } = await res.json()
      setAgents(prev => prev.map(a => a.id === id ? { ...a, ...agent } : a))
    }
  }

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
              {agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} onSave={handleSave} />
              ))}
            </div>
          </div>
        )}

        <LiveProcesses />
      </div>
    </>
  )
}
