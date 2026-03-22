import { Plus } from '@phosphor-icons/react'
import { AgentCard } from './AgentCard'
import { LiveProcesses } from './LiveProcesses'
import type { Agent } from './types'

interface AgentListProps {
  agents: Agent[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
}

export function AgentList({ agents, selectedId, onSelect, onCreate }: AgentListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 16px 12px', flexShrink: 0,
      }}>
        <span style={{
          fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          Agents
        </span>
        <button
          type="button"
          onClick={onCreate}
          aria-label="Create new agent"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '24px', height: '24px', borderRadius: '6px',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          className="hover-bg"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Scrollable agent list */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 12px 12px',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}>
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={agent.id === selectedId}
            onSelect={() => onSelect(agent.id)}
          />
        ))}

        {/* Live processes below agent cards */}
        <div style={{ marginTop: '8px' }}>
          <LiveProcesses agents={agents} />
        </div>
      </div>
    </div>
  )
}
