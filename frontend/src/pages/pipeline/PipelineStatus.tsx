import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { CronJob } from './types'
import { formatNextRun, formatDate } from './utils'

export function PipelineStatus() {
  const [crons, setCrons] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchCrons()
  }, [])

  async function fetchCrons() {
    setLoading(true)
    const json = await api.get<{ jobs?: CronJob[] }>('/api/crons')
    const all: CronJob[] = json.jobs || []
    const filtered = all.filter((j) =>
      j.name?.includes('bjorn-ideas') ||
      j.name?.includes('bjorn-daily') ||
      j.name?.includes('bjorn-weekly')
    )
    setCrons(filtered)
    setLoading(false)
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        Scheduled pipeline runs (filtered to Bjorn agents):
      </div>
      {crons.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          No matching cron jobs found. Expected: bjorn-ideas, bjorn-daily, bjorn-weekly.
        </div>
      ) : (
        crons.map((job, i) => (
          <div
            key={i}
            style={{
              background: 'var(--bg-white-03)',
              border: '1px solid var(--hover-bg-bright)',
              borderRadius: '10px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{job.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>{job.schedule}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: 'var(--accent-bright)', fontWeight: 600 }}>
                {formatNextRun(job.next_run)}
              </div>
              {job.last_run && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  last: {formatDate(job.last_run)}
                </div>
              )}
            </div>
          </div>
        ))
      )}
      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--purple-a08)', border: '1px solid var(--purple-a15)', borderRadius: '8px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expected schedule</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          {'\ud83e\udd16'} Ideas agent {'\u2014'} every 3 hours<br />
          {'\ud83d\udcca'} Daily analysis {'\u2014'} 11:00 PM<br />
          {'\ud83d\udcc5'} Weekly retro {'\u2014'} Sunday 9:00 PM
        </div>
      </div>
    </div>
  )
}
