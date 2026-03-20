import React from 'react'
import { Lightbulb, CheckCircle, SkipForward, XCircle } from '@phosphor-icons/react'
import type { Idea } from './types'
import { pillStyle } from './types'

interface Props {
  pendingIdeas: Idea[]
  onIdeaAction: (id: string, status: 'approved' | 'deferred' | 'rejected') => void
  onOpenDetail: (idea: Idea) => void
}

export const IdeaBriefingCard = React.memo(function IdeaBriefingCard({ pendingIdeas, onIdeaAction, onOpenDetail }: Props) {
  const topIdea = pendingIdeas[0] ?? null
  const pendingCount = pendingIdeas.length

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Lightbulb size={14} style={{ color: 'var(--amber)' }} />
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
            onClick={() => onOpenDetail(topIdea)}
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
              onClick={() => onIdeaAction(topIdea.id, 'approved')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--secondary-a12)', color: 'var(--secondary)', transition: 'all 0.2s var(--ease-spring)' }}
            >
              <CheckCircle size={11} /> Approve
            </button>
            <button
              onClick={() => onIdeaAction(topIdea.id, 'deferred')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--hover-bg)', color: 'var(--text-muted)', transition: 'all 0.2s var(--ease-spring)' }}
            >
              <SkipForward size={11} /> Defer
            </button>
            <button
              onClick={() => onIdeaAction(topIdea.id, 'rejected')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--red-a12)', color: 'var(--red-bright)', transition: 'all 0.2s var(--ease-spring)' }}
            >
              <XCircle size={11} /> Reject
            </button>
            <button
              onClick={() => onOpenDetail(topIdea)}
              style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--accent-bright)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Read more
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
