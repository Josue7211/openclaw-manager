import React from 'react'
import { Rocket, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { usePipelineStatus } from '@/lib/hooks/dashboard/usePipelineStatus'
import { relativeTime } from '@/pages/crons/types'
import type { WidgetProps } from '@/lib/widget-registry'

export const PipelineStatusWidget = React.memo(function PipelineStatusWidget(_props: WidgetProps) {
  const { jobs, activeCount, mounted } = usePipelineStatus()
  const navigate = useNavigate()

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Rocket size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Pipeline Status
        </span>
        {mounted && activeCount > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            fontWeight: 600, lineHeight: 1,
          }}>
            {activeCount}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
          {jobs.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No scheduled jobs
            </div>
          ) : (
            jobs.slice(0, 5).map(job => (
              <div
                key={job.id}
                className="hover-bg"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '8px', transition: 'background 0.15s',
                }}
              >
                {/* Enabled/disabled indicator */}
                <span
                  aria-label={job.enabled !== false ? 'Enabled' : 'Disabled'}
                  style={{
                    width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                    background: job.enabled !== false ? 'var(--green-500)' : 'var(--red-500)',
                  }}
                />
                <span style={{
                  fontSize: '12px', color: 'var(--text-primary)', flex: 1,
                  lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {job.name}
                </span>
                {job.state?.nextRunAtMs != null && (
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0,
                    fontFamily: 'monospace',
                  }}>
                    {relativeTime(job.state.nextRunAtMs)}
                  </span>
                )}
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/pipeline')}
            aria-label="View pipeline status"
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
