import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import type { CronJob } from '@/pages/crons/types'

const CRONS_KEY = ['crons'] as const

const DEMO_CRON_JOBS: CronJob[] = [
  { id: 'demo-c1', name: 'Idea generation', schedule: { kind: 'every', everyMs: 21_600_000 }, state: { nextRunAtMs: Date.now() + 3_600_000, lastRunStatus: 'ok' }, enabled: true },
  { id: 'demo-c2', name: 'Memory compaction', schedule: { kind: 'every', everyMs: 86_400_000 }, state: { nextRunAtMs: Date.now() + 43_200_000, lastRunStatus: 'ok' }, enabled: true },
  { id: 'demo-c3', name: 'Stale item sweep', schedule: { kind: 'every', everyMs: 3_600_000 }, state: { nextRunAtMs: Date.now() + 1_800_000, lastRunStatus: 'ok' }, enabled: true },
  { id: 'demo-c4', name: 'Weekly retrospective', schedule: { kind: 'every', everyMs: 604_800_000 }, state: { nextRunAtMs: Date.now() + 259_200_000, lastRunStatus: 'ok' }, enabled: false },
]

export function usePipelineStatus() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<{ jobs?: CronJob[] }>({
    queryKey: CRONS_KEY,
    queryFn: () => api.get<{ jobs?: CronJob[] }>('/api/crons'),
    refetchInterval: 30_000,
    enabled: !_demo,
  })

  const allJobs = _demo ? DEMO_CRON_JOBS : (data?.jobs ?? [])

  const nextRun = useMemo(() => {
    const enabledJobs = allJobs.filter(j => j.enabled !== false)
    const nextTimes = enabledJobs
      .map(j => j.state?.nextRunAtMs)
      .filter((t): t is number => t != null && t > Date.now())
    return nextTimes.length > 0 ? Math.min(...nextTimes) : null
  }, [allJobs])

  const activeCount = useMemo(
    () => allJobs.filter(j => j.enabled !== false).length,
    [allJobs],
  )

  return { jobs: allJobs, nextRun, activeCount, mounted: _demo || isSuccess }
}
