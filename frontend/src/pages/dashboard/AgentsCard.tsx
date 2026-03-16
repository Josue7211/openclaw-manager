import React from 'react'
import { Bot } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { SkeletonRows } from '@/components/Skeleton'
import type { AgentInfo, AgentsData, SubagentData, ActiveSubagentData } from './types'

interface Props {
  mounted: boolean
  sortedAgents: AgentInfo[]
  agentsData: AgentsData | null
  subagents: SubagentData | null
  activeSubagents: ActiveSubagentData
}

export const AgentsCard = React.memo(function AgentsCard({ mounted, sortedAgents, agentsData, subagents, activeSubagents }: Props) {
  return (
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
        <div className="hidden-scrollbar" style={{ maxHeight: '320px', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sortedAgents.map((agent) => {
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
              ? { cls: '', dot: 'var(--yellow-bright)', label: '\u23F3 Awaiting Deploy', pulse: true, yellow: true }
              : { cls: 'badge-purple', dot: 'var(--accent)', label: 'Ready', pulse: false }

            return (
              <div key={agent.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', background: 'var(--bg-base)',
                borderRadius: '12px', border: '1px solid var(--border)',
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
                    background: 'var(--yellow-bright-a12)',
                    color: 'var(--yellow-bright)',
                    border: '1px solid var(--yellow-bright-a35)',
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
        </div>
      )}
    </div>
  )
})
