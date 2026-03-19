import React from 'react'
import { Check, CaretDown } from '@phosphor-icons/react'
import { timeAgo } from '@/lib/utils'
import type { Mission, Agent } from './types'
import { statusColor, statusIcon } from './utils'
import { AccordionBody } from './AccordionBody'

export const MissionCard = React.memo(function MissionCard({
  mission,
  assigneeAgent,
  isExpanded,
  isMarkingDone,
  onToggleExpand,
  onMarkDone,
}: {
  mission: Mission
  assigneeAgent?: Agent
  isExpanded: boolean
  isMarkingDone: boolean
  onToggleExpand: (missionId: string) => void
  onMarkDone: (missionId: string, e: React.MouseEvent) => void
}) {
  const done = mission.status === 'done'
  const canMarkDone = !done
  const barPct = done ? 100 : (mission.progress ?? 0)
  const barColor = done
    ? 'var(--green-400)'
    : mission.status === 'active'
      ? 'var(--accent)'
      : 'var(--text-muted)'
  const assigneeLabel = assigneeAgent
    ? `${assigneeAgent.emoji ? assigneeAgent.emoji + ' ' : ''}${assigneeAgent.display_name}`
    : null

  return (
    <div
      style={{
        borderRadius: '10px',
        background: isExpanded ? 'var(--hover-bg)' : 'var(--bg-card)',
        border: `1px solid ${isExpanded ? 'var(--purple-a30)' : done ? 'var(--green-400-a15)' : 'var(--border)'}`,
        opacity: done ? 0.88 : 1,
        transition: 'border-color 0.15s, background 0.15s',
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div
        onClick={() => onToggleExpand(mission.id)}
        style={{
          padding: '12px 16px 10px',
          display: 'flex', flexDirection: 'column', gap: '8px',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          if (!isExpanded) {
            const card = e.currentTarget.parentElement!
            card.style.borderColor = 'var(--border-accent)'
            card.style.background  = 'var(--hover-bg)'
          }
        }}
        onMouseLeave={e => {
          if (!isExpanded) {
            const card = e.currentTarget.parentElement!
            card.style.borderColor = done ? 'var(--green-400-a15)' : 'var(--border)'
            card.style.background  = 'var(--bg-card)'
          }
        }}
      >
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flexShrink: 0 }}>{statusIcon(mission.status)}</div>

          {/* Title + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '13px', fontWeight: 500,
              color: 'var(--text-primary)',
              textDecoration: done ? 'line-through' : 'none',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {done && <span style={{ color: 'var(--green-400)', marginRight: '6px', textDecoration: 'none', display: 'inline-block' }}>&#10003;</span>}
              {mission.title}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {assigneeLabel ? (
                <span>{assigneeLabel}</span>
              ) : (
                <span>
                  {mission.assignee}
                  <span style={{ color: 'var(--text-muted)', opacity: 0.5, marginLeft: '4px' }}>(removed)</span>
                </span>
              )}
              <span>&middot;</span>
              <span>{timeAgo(mission.created_at)}</span>
              {mission.complexity != null && (
                <>
                  <span>&middot;</span>
                  <span style={{
                    color: mission.complexity > 70 ? 'var(--red-500)' : mission.complexity > 40 ? 'var(--amber)' : 'var(--green-400)',
                  }}>
                    {mission.complexity}%
                  </span>
                </>
              )}
              {mission.task_type && mission.task_type !== 'non-code' && (
                <span style={{
                  fontSize: '9px', padding: '1px 5px', borderRadius: '10px',
                  background: mission.task_type === 'code' ? 'var(--blue-a08)' : 'var(--purple-a12)',
                  border: `1px solid ${mission.task_type === 'code' ? 'var(--blue-a25)' : 'var(--purple-a30)'}`,
                  color: mission.task_type === 'code' ? 'var(--blue)' : 'var(--accent-bright)',
                }}>
                  {mission.task_type}
                </span>
              )}
              {mission.review_status === 'pending' && (
                <span style={{
                  fontSize: '9px', padding: '1px 5px', borderRadius: '10px',
                  background: 'var(--warning-a12)', border: '1px solid var(--warning-a30)',
                  color: 'var(--warning)', fontWeight: 600,
                }}>
                  needs review
                </span>
              )}
              {mission.review_status === 'rejected' && (
                <span style={{
                  fontSize: '9px', padding: '1px 5px', borderRadius: '10px',
                  background: 'var(--red-500-a12)', border: '1px solid var(--red-a30)',
                  color: 'var(--red-bright)', fontWeight: 600,
                }}>
                  rejected
                </span>
              )}
              {(mission.retry_count ?? 0) > 0 && (
                <>
                  <span>&middot;</span>
                  <span style={{ color: 'var(--red-500)' }}>
                    {mission.retry_count} retries
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Mark done */}
          {canMarkDone && (
            <button
              onClick={e => onMarkDone(mission.id, e)}
              disabled={isMarkingDone}
              title="Mark done"
              style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', borderRadius: '10px',
                border: '1px solid var(--green-400-a30)',
                background: 'var(--green-400-a06)',
                color: 'var(--green-400)',
                fontSize: '11px', cursor: isMarkingDone ? 'wait' : 'pointer',
                opacity: isMarkingDone ? 0.5 : 1,
                transition: 'all 0.25s var(--ease-spring)',
              }}
              onMouseEnter={e => { if (!isMarkingDone) { e.currentTarget.style.background = 'var(--green-400-a14)'; e.currentTarget.style.borderColor = 'var(--green-400-a45)' } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--green-400-a06)'; e.currentTarget.style.borderColor = 'var(--green-400-a30)' }}
            >
              <Check size={11} />
              Done
            </button>
          )}

          {/* Status badge */}
          <div style={{
            flexShrink: 0, fontSize: '10px', fontFamily: 'monospace',
            padding: '2px 8px', borderRadius: '10px',
            color: statusColor(mission.status),
            background: done ? 'var(--green-400-a08)' : mission.status === 'active' ? 'var(--purple-a10)' : 'var(--hover-bg)',
            border: `1px solid ${done ? 'var(--green-400-a15)' : mission.status === 'active' ? 'var(--purple-a20)' : 'var(--border)'}`,
          }}>
            {mission.status}
          </div>

          {/* Chevron */}
          <div style={{
            flexShrink: 0, color: 'var(--text-muted)',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            display: 'flex', alignItems: 'center',
          }}>
            <CaretDown size={14} />
          </div>
        </div>

      </div>

      {/* Progress bar — thin strip at bottom of card header */}
      <div style={{ height: '3px', background: 'var(--active-bg)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${barPct}%`,
          background: done ? 'var(--green-400)' : 'var(--accent)',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Accordion body */}
      <div style={{
        display: 'grid',
        gridTemplateRows: isExpanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.25s ease',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0 16px 14px' }}>
            <AccordionBody missionId={mission.id} mission={mission} agent={assigneeAgent} />
          </div>
        </div>
      </div>
    </div>
  )
})
