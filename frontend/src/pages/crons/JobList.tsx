import { Clock, PencilSimple, Trash } from '@phosphor-icons/react'
import { SkeletonList } from '@/components/Skeleton'
import Toggle from '@/pages/settings/Toggle'
import type { CronJob } from './types'
import { COLORS, humanSchedule, relativeTime } from './types'

interface JobListProps {
  jobs: CronJob[]
  loading: boolean
  onEditJob?: (job: CronJob) => void
  onToggleJob?: (id: string, enabled: boolean) => void
  onDeleteJob?: (id: string) => void
}

export function JobList({ jobs, loading, onEditJob, onToggleJob, onDeleteJob }: JobListProps) {
  return (
    <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', borderRadius: '10px', padding: '16px 20px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <Clock size={13} style={{ color: 'var(--purple)' }} />
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          All Cron Jobs
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>({jobs.length})</span>
      </div>

      {loading ? (
        <SkeletonList count={2} lines={2} />
      ) : jobs.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No cron jobs found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {jobs.map((job, ji) => {
            const color = COLORS[ji % COLORS.length]
            const nextRun = job.state?.nextRunAtMs
            const enabled = job.enabled ?? true
            return (
              <div
                key={job.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-inset)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Color dot */}
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />

                {/* Name (clickable to edit) */}
                <button
                  onClick={() => onEditJob?.(job)}
                  aria-label={'Edit ' + job.name}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  {job.name}
                </button>

                {/* Schedule */}
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color, background: `${color}18`, border: `1px solid ${color}33`, padding: '1px 7px', borderRadius: '4px', flexShrink: 0 }}>
                  {humanSchedule(job)}
                </span>

                {/* Next run */}
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: '60px', textAlign: 'right', flexShrink: 0 }}>
                  {nextRun ? relativeTime(nextRun) : '\u2014'}
                </span>

                {/* Toggle */}
                <span role="presentation" onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                  <Toggle
                    on={enabled}
                    onToggle={(val) => onToggleJob?.(job.id, val)}
                    label={'Toggle ' + job.name}
                  />
                </span>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button
                    aria-label={'Edit ' + job.name}
                    onClick={() => onEditJob?.(job)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', borderRadius: '4px' }}
                  >
                    <PencilSimple size={14} />
                  </button>
                  <button
                    aria-label={'Delete ' + job.name}
                    onClick={() => onDeleteJob?.(job.id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', borderRadius: '4px' }}
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
