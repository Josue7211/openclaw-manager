



import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'
import type { CronJob } from './crons/types'
import { FREQUENT_MS, navBtnStyle, getWeekStart, formatWeekLabel } from './crons/types'
import { FrequentBar } from './crons/FrequentBar'
import { WeekGrid } from './crons/WeekGrid'
import { JobList } from './crons/JobList'

export default function CronsPage() {
  const { data: cronsData, isLoading: loading } = useTauriQuery<{ jobs: CronJob[] }>(
    ['crons'],
    '/api/crons',
  )
  const jobs = cronsData?.jobs ?? []

  const [weekOffset, setWeekOffset] = useState(0)
  const now = useRef(new Date()).current

  const baseWeekStart = getWeekStart(now)
  const weekStart = new Date(baseWeekStart)
  weekStart.setDate(weekStart.getDate() + weekOffset * 7)
  const isCurrentWeek = weekOffset === 0
  const todayDow = now.getDay()

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // Partition: frequent jobs (< 1h) go to top bar, rest go to grid
  const frequentJobs = jobs.filter(
    j => j.schedule.kind === 'every' && j.schedule.everyMs && j.schedule.everyMs < FREQUENT_MS
  )
  const gridJobs = jobs.filter(
    j => !(j.schedule.kind === 'every' && j.schedule.everyMs && j.schedule.everyMs < FREQUENT_MS)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <PageHeader defaultTitle="Cron Calendar" defaultSubtitle="automated routines · week view" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtnStyle}>
            <ChevronLeft size={13} /> Prev
          </button>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '160px', textAlign: 'center' }}>
            {formatWeekLabel(weekStart)}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtnStyle}>
            Next <ChevronRight size={13} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            style={{
              ...navBtnStyle,
              background: isCurrentWeek ? 'var(--purple-a15)' : 'transparent',
              borderColor: isCurrentWeek ? 'var(--purple)' : 'var(--border-strong)',
              color: isCurrentWeek ? 'var(--purple)' : 'var(--text-secondary)',
            }}
          >
            Today
          </button>
        </div>
      </div>

      <FrequentBar frequentJobs={frequentJobs} allJobs={jobs} />

      <WeekGrid
        gridJobs={gridJobs}
        allJobs={jobs}
        weekStart={weekStart}
        isCurrentWeek={isCurrentWeek}
        todayDow={todayDow}
        weekDays={weekDays}
        now={now}
        loading={loading}
      />

      <JobList jobs={jobs} loading={loading} />
    </div>
  )
}
