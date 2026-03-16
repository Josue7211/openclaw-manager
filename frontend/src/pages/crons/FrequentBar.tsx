import { Zap } from 'lucide-react'
import type { CronJob } from './types'
import { COLORS, humanSchedule } from './types'

interface FrequentBarProps {
  frequentJobs: CronJob[]
  allJobs: CronJob[]
}

export function FrequentBar({ frequentJobs, allJobs }: FrequentBarProps) {
  if (frequentJobs.length === 0) return null

  return (
    <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', borderRadius: '10px', padding: '12px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <Zap size={12} style={{ color: 'var(--orange)' }} />
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Frequent
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>&lt; 1h interval</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {frequentJobs.map(job => {
          const color = COLORS[allJobs.indexOf(job) % COLORS.length]
          return (
            <div
              key={job.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: `${color}18`,
                border: `1px solid ${color}44`,
                borderRadius: '20px',
                padding: '4px 12px',
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{job.name}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {humanSchedule(job)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
