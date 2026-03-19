import React from 'react'
import { Lightbulb, X, CheckCircle, SkipForward, XCircle } from '@phosphor-icons/react'
import type { Idea } from './types'
import { effortColor } from './types'

interface Props {
  idea: Idea
  onClose: () => void
  onIdeaAction: (id: string, status: 'approved' | 'deferred' | 'rejected') => void
}

// Larger pill style for the detail panel
function panelPillStyle(v: string | null): React.CSSProperties {
  return {
    display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
    fontWeight: 600, background: `${effortColor(v)}22`, color: effortColor(v),
    border: `1px solid ${effortColor(v)}44`, textTransform: 'capitalize',
  }
}

export const IdeaDetailPanel = React.memo(function IdeaDetailPanel({ idea, onClose, onIdeaAction }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'var(--overlay-light)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200,
          animation: 'fadeIn 0.25s var(--ease-spring)',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(480px, 90vw)',
        background: 'var(--bg-card-solid)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        borderLeft: '1px solid var(--border)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.35s var(--ease-spring)',
        boxShadow: '-20px 0 60px var(--overlay-light)',
        overflowY: 'auto',
      }}>
        {/* Panel header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={14} style={{ color: 'var(--amber)', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Idea Detail</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', borderRadius: '4px', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Panel body */}
        <div style={{ padding: '24px', flex: 1 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {idea.title}
          </h2>

          {/* Metadata pills */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
            {idea.effort && <span style={panelPillStyle(idea.effort)}>effort: {idea.effort}</span>}
            {idea.impact && <span style={panelPillStyle(idea.impact)}>impact: {idea.impact}</span>}
            {idea.category && (
              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {idea.category}
              </span>
            )}
          </div>

          {/* Description */}
          {idea.description && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Description</div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{idea.description}</p>
            </div>
          )}

          {/* Why it fits */}
          {idea.why && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Why it fits your workflow</div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', borderLeft: '3px solid var(--accent)' }}>{idea.why}</p>
            </div>
          )}

          {/* Date */}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '24px' }}>
            Generated {new Date(idea.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => onIdeaAction(idea.id, 'approved')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '12px', fontWeight: 600, borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'var(--green)', color: 'var(--text-on-accent)', transition: 'all 0.2s var(--ease-spring)', boxShadow: '0 2px 12px var(--green-a25)' }}
            >
              <CheckCircle size={13} /> Approve
            </button>
            <button
              onClick={() => onIdeaAction(idea.id, 'deferred')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '12px', fontWeight: 600, borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--hover-bg)', color: 'var(--text-secondary)', transition: 'all 0.2s var(--ease-spring)' }}
            >
              <SkipForward size={13} /> Defer
            </button>
            <button
              onClick={() => onIdeaAction(idea.id, 'rejected')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '12px', fontWeight: 600, borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'var(--red)', color: 'var(--text-on-accent)', transition: 'all 0.2s var(--ease-spring)', boxShadow: '0 2px 12px var(--red-a30)' }}
            >
              <XCircle size={13} /> Reject
            </button>
          </div>
        </div>
      </div>
    </>
  )
})
