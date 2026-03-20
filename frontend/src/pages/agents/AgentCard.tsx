import { useState } from 'react'
import { AGENT_STATUS, MISSION_STATUS } from '@/lib/constants'
import type { Mission } from '@/lib/types'
import type { Agent } from './types'
import type { ModelOption } from '../chat/types'


function StatusDot({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: active ? 'var(--secondary)' : 'var(--text-muted)',
      animation: active ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
      flexShrink: 0,
    }} />
  )
}

interface AgentCardProps {
  agent: Agent
  onSave: (id: string, fields: { display_name: string; emoji: string; role: string; model: string }) => Promise<void>
  activeMission?: Mission | null
  models?: ModelOption[]
}

export function AgentCard({ agent, onSave, activeMission, models = [] }: AgentCardProps) {
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
      background: 'var(--bg-card)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: `1px solid ${active ? 'var(--secondary-a30)' : awaitingDeploy ? 'var(--yellow-bright-a35)' : 'var(--accent)44'}`,
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
            aria-label="Agent emoji"
            style={{
              width: '48px', fontSize: '28px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '4px', textAlign: 'center',
            }}
          />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            aria-label="Agent name"
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
              aria-label="Agent role"
              style={{
                fontSize: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '5px 8px', color: 'var(--text-primary)',
              }}
            />
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              aria-label="Agent model"
              style={{
                fontSize: '11px', fontFamily: 'monospace',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '5px 8px', color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {model && !models.some(m => m.id === model) && (
                <option value={model}>{model}</option>
              )}
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '10px', fontWeight: 600, color: 'var(--accent-bright)',
              background: 'var(--purple-a12)', border: '1px solid var(--border-accent)',
              borderRadius: '4px', padding: '2px 8px',
            }}>
              {agent.role}
            </span>
            {agent.model && (
              <span style={{
                fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)',
                background: 'var(--hover-bg)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '2px 7px',
              }}>
                {models.find(m => m.id === agent.model)?.name ?? agent.model}
              </span>
            )}
          </div>
        )}
      </div>

      <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {awaitingDeploy ? (
          <span style={{
            fontSize: '11px', fontWeight: 700,
            color: 'var(--yellow-bright)',
            background: 'var(--yellow-bright-a12)',
            border: '1px solid var(--yellow-bright-a35)',
            borderRadius: '10px', padding: '2px 8px',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }}>
            Awaiting Deploy
          </span>
        ) : (
          <>
            <StatusDot active={active} />
            <span style={{ fontSize: '11px', color: active ? 'var(--secondary)' : 'var(--text-muted)', fontWeight: 600 }}>
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

      {active && activeMission && (activeMission.progress ?? 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ height: '6px', borderRadius: '3px', background: 'var(--hover-bg)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${activeMission.progress}%`,
              borderRadius: '3px',
              background: 'var(--accent-blue)',
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
                border: 'none', background: 'var(--accent)', color: 'var(--text-on-color)',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
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
