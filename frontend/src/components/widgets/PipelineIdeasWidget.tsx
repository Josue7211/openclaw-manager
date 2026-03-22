import React from 'react'
import { Lightbulb, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { usePipelineIdeas } from '@/lib/hooks/dashboard/usePipelineIdeas'
import type { WidgetProps } from '@/lib/widget-registry'

const EFFORT_COLORS: Record<string, string> = {
  low: 'var(--green-500)',
  medium: 'var(--gold)',
  high: 'var(--red-500)',
}

export const PipelineIdeasWidget = React.memo(function PipelineIdeasWidget(_props: WidgetProps) {
  const { ideas, pendingCount, approvedCount, builtCount, mounted } = usePipelineIdeas()
  const navigate = useNavigate()

  const pendingIdeas = ideas.filter(i => i.status === 'pending').slice(0, 3)

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Lightbulb size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Ideas Pipeline
        </span>
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
          {/* Status badges */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px',
              background: 'var(--gold-a12, rgba(234, 179, 8, 0.12))', color: 'var(--gold)',
              border: '1px solid var(--gold-a25, rgba(234, 179, 8, 0.25))',
            }}>
              {pendingCount} Pending
            </span>
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px',
              background: 'var(--secondary-a12, rgba(34, 197, 94, 0.12))', color: 'var(--green-500)',
              border: '1px solid var(--secondary-a25, rgba(34, 197, 94, 0.25))',
            }}>
              {approvedCount} Approved
            </span>
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px',
              background: 'var(--blue-a25, rgba(59, 130, 246, 0.12))', color: 'var(--blue)',
              border: '1px solid var(--blue-a25, rgba(59, 130, 246, 0.25))',
            }}>
              {builtCount} Built
            </span>
          </div>

          {/* Latest pending ideas */}
          {pendingIdeas.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No pending ideas
            </div>
          ) : (
            pendingIdeas.map(idea => (
              <div
                key={idea.id}
                className="hover-bg"
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)',
                    flex: 1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {idea.title}
                  </span>
                  <span style={{
                    fontSize: '9px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px',
                    background: `${EFFORT_COLORS[idea.effort] ?? 'var(--text-muted)'}22`,
                    color: EFFORT_COLORS[idea.effort] ?? 'var(--text-muted)',
                    border: `1px solid ${EFFORT_COLORS[idea.effort] ?? 'var(--text-muted)'}44`,
                    textTransform: 'capitalize', flexShrink: 0,
                  }}>
                    {idea.effort}
                  </span>
                </div>
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/pipeline')}
            aria-label="View all pipeline ideas"
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
