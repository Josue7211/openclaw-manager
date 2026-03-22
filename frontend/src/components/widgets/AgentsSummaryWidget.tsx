import React from 'react'
import { Users, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useAgentsData, useSubagentData } from '@/lib/hooks/dashboard'
import type { WidgetProps } from '@/lib/widget-registry'

function statusColor(status: string): string {
  if (status === 'active') return 'var(--green-500)'
  if (status === 'error') return 'var(--red-500)'
  return 'var(--text-muted)'
}

export const AgentsSummaryWidget = React.memo(function AgentsSummaryWidget(_props: WidgetProps) {
  const { sortedAgents, mounted } = useAgentsData()
  const { activeSubagents } = useSubagentData()
  const navigate = useNavigate()

  const onlineCount = sortedAgents.filter(a => a.status === 'active').length

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Users size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Agents
        </span>
        {mounted && onlineCount > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--green-500)', color: '#fff',
            fontWeight: 600, lineHeight: 1,
          }}>
            {onlineCount} active
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0 }}>
          {sortedAgents.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No agents registered
            </div>
          ) : (
            sortedAgents.map(agent => (
              <div
                key={agent.id}
                className="hover-bg"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 8px', borderRadius: '8px',
                  transition: 'background 0.15s',
                }}
              >
                {/* Status dot */}
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: statusColor(agent.status), flexShrink: 0,
                }} />
                {/* Name */}
                <span style={{
                  fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {agent.emoji} {agent.display_name}
                </span>
                {/* Model pill */}
                <span style={{
                  fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
                  background: 'var(--bg-white-03)', color: 'var(--text-muted)',
                  fontWeight: 500, border: '1px solid var(--border)',
                  flexShrink: 0, maxWidth: '80px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {agent.model.replace('claude-', '').replace('-4-6', '').replace('-4-5', '')}
                </span>
              </div>
            ))
          )}

          {/* Active subagents indicator */}
          {activeSubagents.active && activeSubagents.count > 0 && (
            <div style={{
              fontSize: '11px', color: 'var(--text-muted)', padding: '4px 8px',
              marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: 'var(--amber)', flexShrink: 0,
              }} />
              {activeSubagents.count} subagent{activeSubagents.count !== 1 ? 's' : ''} running
            </div>
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/agents')}
            aria-label="View all agents"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto',
              paddingTop: '8px', fontSize: '11px', color: 'var(--accent)',
              background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            }}
          >
            View all <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
})
