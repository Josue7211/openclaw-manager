import React from 'react'
import { AGENT_STATUS } from '@/lib/constants'
import type { Agent } from './types'

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
  selected: boolean
  onSelect: () => void
}

export const AgentCard = React.memo(function AgentCard({ agent, selected, onSelect }: AgentCardProps) {
  const active = agent.status === AGENT_STATUS.ACTIVE
  const awaitingDeploy = agent.status === AGENT_STATUS.AWAITING_DEPLOY

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        background: selected ? 'var(--active-bg)' : 'var(--bg-card)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: `1px solid ${selected ? 'var(--accent)44' : 'var(--border)'}`,
        borderRadius: '16px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'border-color 0.3s, background 0.15s',
        fontFamily: 'inherit',
        color: 'inherit',
      }}
    >
      <span style={{ fontSize: '28px', lineHeight: 1, flexShrink: 0 }}>{agent.emoji}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {agent.display_name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
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
              {agent.model}
            </span>
          )}
        </div>

        <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {awaitingDeploy ? (
            <span style={{
              fontSize: '10px', fontWeight: 700,
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
              <span style={{ fontSize: '10px', color: active ? 'var(--secondary)' : 'var(--text-muted)', fontWeight: 600 }}>
                {active ? 'Working' : 'Idle'}
              </span>
            </>
          )}
        </div>

        {agent.current_task && (
          <p style={{
            margin: '4px 0 0', fontSize: '11px',
            color: active ? 'var(--text-secondary)' : 'var(--text-muted)',
            lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', fontStyle: active ? 'normal' : 'italic',
          }}>
            {active ? '' : 'Last: '}{agent.current_task}
          </p>
        )}
      </div>
    </button>
  )
})
