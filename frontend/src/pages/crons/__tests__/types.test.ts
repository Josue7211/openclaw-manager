import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  COLORS,
  DAY_NAMES,
  HOUR_HEIGHT,
  TOTAL_HEIGHT,
  FREQUENT_MS,
  navBtnStyle,
  humanSchedule,
  relativeTime,
  getWeekStart,
  formatWeekLabel,
  getFireTimesInWeek,
} from '../types'
import type { CronSchedule, CronState, CronJob, FireTime } from '../types'

/* ─── Constants ──────────────────────────────────────────────────────── */

describe('COLORS', () => {
  it('has 7 entries', () => {
    expect(COLORS).toHaveLength(7)
  })

  it('every entry is a non-empty string', () => {
    for (const c of COLORS) {
      expect(typeof c).toBe('string')
      expect(c.length).toBeGreaterThan(0)
    }
  })
})

describe('DAY_NAMES', () => {
  it('has 7 entries', () => {
    expect(DAY_NAMES).toHaveLength(7)
  })

  it('starts with Sun and ends with Sat', () => {
    expect(DAY_NAMES[0]).toBe('Sun')
    expect(DAY_NAMES[6]).toBe('Sat')
  })
})

describe('dimension constants', () => {
  it('HOUR_HEIGHT is 60', () => {
    expect(HOUR_HEIGHT).toBe(60)
  })

  it('TOTAL_HEIGHT is 24 * HOUR_HEIGHT', () => {
    expect(TOTAL_HEIGHT).toBe(24 * HOUR_HEIGHT)
    expect(TOTAL_HEIGHT).toBe(1440)
  })

  it('FREQUENT_MS is 1 hour in ms', () => {
    expect(FREQUENT_MS).toBe(3600000)
  })
})

describe('navBtnStyle', () => {
  it('uses flex layout', () => {
    expect(navBtnStyle.display).toBe('flex')
    expect(navBtnStyle.alignItems).toBe('center')
  })

  it('has transparent background', () => {
    expect(navBtnStyle.background).toBe('transparent')
  })

  it('has pointer cursor', () => {
    expect(navBtnStyle.cursor).toBe('pointer')
  })

  it('prevents text wrapping', () => {
    expect(navBtnStyle.whiteSpace).toBe('nowrap')
  })
})

/* ─── Type structural validation ─────────────────────────────────────── */

describe('type exports', () => {
  it('CronSchedule type is structurally valid', () => {
    const schedule: CronSchedule = {
      kind: 'every',
      everyMs: 3600000,
    }
    expect(schedule.kind).toBe('every')
    expect(schedule.everyMs).toBe(3600000)
  })

  it('CronSchedule with cron expression', () => {
    const schedule: CronSchedule = {
      kind: 'cron',
      expr: '0 0 * * *',
    }
    expect(schedule.kind).toBe('cron')
    expect(schedule.expr).toBe('0 0 * * *')
  })

  it('CronState optional fields default to undefined', () => {
    const state: CronState = {}
    expect(state.nextRunAtMs).toBeUndefined()
    expect(state.lastRunAtMs).toBeUndefined()
    expect(state.lastRunStatus).toBeUndefined()
  })

  it('CronJob type is structurally valid', () => {
    const job: CronJob = {
      id: 'cron-1',
      name: 'backup',
      description: 'Nightly backup',
      schedule: { kind: 'every', everyMs: 86400000 },
      state: { nextRunAtMs: 1742342400000, lastRunStatus: 'ok' },
      enabled: true,
    }
    expect(job.name).toBe('backup')
    expect(job.enabled).toBe(true)
  })

  it('CronJob optional fields default to undefined', () => {
    const job: CronJob = {
      id: 'cron-2',
      name: 'test',
      schedule: { kind: 'every' },
    }
    expect(job.description).toBeUndefined()
    expect(job.state).toBeUndefined()
    expect(job.createdAtMs).toBeUndefined()
    expect(job.createdAt).toBeUndefined()
    expect(job.enabled).toBeUndefined()
  })

  it('FireTime type is structurally valid', () => {
    const fire: FireTime = {
      ms: 1742342400000,
      dayIndex: 3,
      top: 720,
    }
    expect(fire.dayIndex).toBe(3)
    expect(fire.top).toBe(720)
  })
})

/* ─── humanSchedule ──────────────────────────────────────────────────── */

describe('humanSchedule', () => {
  const makeJob = (schedule: CronSchedule): CronJob => ({
    id: 'j1',
    name: 'test',
    schedule,
  })

  it('formats days for everyMs >= 24h', () => {
    expect(humanSchedule(makeJob({ kind: 'every', everyMs: 86400000 }))).toBe('every 1d')
    expect(humanSchedule(makeJob({ kind: 'every', everyMs: 172800000 }))).toBe('every 2d')
  })

  it('formats hours for everyMs >= 1h', () => {
    expect(humanSchedule(makeJob({ kind: 'every', everyMs: 3600000 }))).toBe('every 1h')
    expect(humanSchedule(makeJob({ kind: 'every', everyMs: 7200000 }))).toBe('every 2h')
  })

  it('formats fractional hours', () => {
    // 1.5 hours
    expect(humanSchedule(makeJob({ kind: 'every', everyMs: 5400000 }))).toBe('every 1.5h')
  })

  it('formats minutes for everyMs >= 1m', () => {
    expect(humanSchedule(makeJob({ kind: 'every', everyMs: 60000 }))).toBe('every 1m')
    expect(humanSchedule(makeJob({ kind: 'every', everyMs: 300000 }))).toBe('every 5m')
  })

  it('formats milliseconds for very short intervals', () => {
    expect(humanSchedule(makeJob({ kind: 'every', everyMs: 500 }))).toBe('every 500ms')
  })

  it('returns cron expression for cron kind', () => {
    expect(humanSchedule(makeJob({ kind: 'cron', expr: '0 0 * * *' }))).toBe('0 0 * * *')
  })

  it('returns kind name for unknown kinds', () => {
    expect(humanSchedule(makeJob({ kind: 'manual' }))).toBe('manual')
  })

  it('returns "unknown" when kind is empty', () => {
    expect(humanSchedule(makeJob({ kind: '' }))).toBe('unknown')
  })
})

/* ─── relativeTime ───────────────────────────────────────────────────── */

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for recent past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const thirtySecsAgo = Date.now() - 30000
    expect(relativeTime(thirtySecsAgo)).toBe('just now')
  })

  it('returns "in <1m" for near future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const thirtySecsFromNow = Date.now() + 30000
    expect(relativeTime(thirtySecsFromNow)).toBe('in <1m')
  })

  it('returns minutes ago for past within an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const fiveMinsAgo = Date.now() - 5 * 60000
    expect(relativeTime(fiveMinsAgo)).toBe('5m ago')
  })

  it('returns "in Nm" for future within an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const tenMinsFromNow = Date.now() + 10 * 60000
    expect(relativeTime(tenMinsFromNow)).toBe('in 10m')
  })

  it('returns hours ago for past within a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const threeHoursAgo = Date.now() - 3 * 3600000
    expect(relativeTime(threeHoursAgo)).toBe('3h ago')
  })

  it('returns "in Nh" for future within a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const sixHoursFromNow = Date.now() + 6 * 3600000
    expect(relativeTime(sixHoursFromNow)).toBe('in 6h')
  })

  it('returns days ago for past beyond a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const twoDaysAgo = Date.now() - 2 * 86400000
    expect(relativeTime(twoDaysAgo)).toBe('2d ago')
  })

  it('returns "in Nd" for future beyond a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const threeDaysFromNow = Date.now() + 3 * 86400000
    expect(relativeTime(threeDaysFromNow)).toBe('in 3d')
  })
})

/* ─── getWeekStart ───────────────────────────────────────────────────── */

describe('getWeekStart', () => {
  it('returns Sunday for a Wednesday', () => {
    // 2026-03-11 is a Wednesday
    const wed = new Date(2026, 2, 11, 15, 30)
    const result = getWeekStart(wed)
    expect(result.getDay()).toBe(0) // Sunday
    expect(result.getDate()).toBe(8)
  })

  it('returns Sunday itself for a Sunday', () => {
    // 2026-03-15 is a Sunday
    const sun = new Date(2026, 2, 15, 10, 0)
    const result = getWeekStart(sun)
    expect(result.getDay()).toBe(0)
    expect(result.getDate()).toBe(15)
  })

  it('zeroes out time', () => {
    const d = new Date(2026, 2, 11, 14, 30, 45, 123)
    const result = getWeekStart(d)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })

  it('does not mutate the original date', () => {
    const d = new Date(2026, 2, 11, 15, 30)
    const originalTime = d.getTime()
    getWeekStart(d)
    expect(d.getTime()).toBe(originalTime)
  })
})

/* ─── formatWeekLabel ────────────────────────────────────────────────── */

describe('formatWeekLabel', () => {
  it('returns "Week of ..." format', () => {
    const d = new Date(2026, 2, 8) // March 8
    const result = formatWeekLabel(d)
    expect(result).toMatch(/^Week of /)
  })

  it('contains the month and day', () => {
    const d = new Date(2026, 2, 8)
    const result = formatWeekLabel(d)
    expect(result).toContain('Mar')
    expect(result).toContain('8')
  })
})

/* ─── getFireTimesInWeek ─────────────────────────────────────────────── */

describe('getFireTimesInWeek', () => {
  it('returns empty array for cron kind', () => {
    const job: CronJob = {
      id: 'j1',
      name: 'test',
      schedule: { kind: 'cron', expr: '0 0 * * *' },
    }
    const weekStart = new Date(2026, 2, 8) // Sunday March 8
    expect(getFireTimesInWeek(job, weekStart)).toEqual([])
  })

  it('returns empty array when everyMs is undefined', () => {
    const job: CronJob = {
      id: 'j1',
      name: 'test',
      schedule: { kind: 'every' },
    }
    const weekStart = new Date(2026, 2, 8)
    expect(getFireTimesInWeek(job, weekStart)).toEqual([])
  })

  it('returns fire times for an every-24h job', () => {
    const weekStart = new Date(2026, 2, 8, 0, 0, 0, 0) // Sunday March 8
    const job: CronJob = {
      id: 'j1',
      name: 'daily',
      schedule: { kind: 'every', everyMs: 86400000 },
      createdAt: weekStart.toISOString(),
    }
    const fires = getFireTimesInWeek(job, weekStart)
    // Should have 7 fires (one per day)
    expect(fires).toHaveLength(7)
  })

  it('fire times have valid dayIndex (0-6)', () => {
    const weekStart = new Date(2026, 2, 8, 0, 0, 0, 0)
    const job: CronJob = {
      id: 'j2',
      name: 'hourly',
      schedule: { kind: 'every', everyMs: 3600000 },
      createdAt: weekStart.toISOString(),
    }
    const fires = getFireTimesInWeek(job, weekStart)
    for (const fire of fires) {
      expect(fire.dayIndex).toBeGreaterThanOrEqual(0)
      expect(fire.dayIndex).toBeLessThanOrEqual(6)
    }
  })

  it('fire times have top = hours*60 + minutes', () => {
    const weekStart = new Date(2026, 2, 8, 0, 0, 0, 0)
    const job: CronJob = {
      id: 'j3',
      name: 'every-12h',
      schedule: { kind: 'every', everyMs: 43200000 },
      createdAt: weekStart.toISOString(),
    }
    const fires = getFireTimesInWeek(job, weekStart)
    for (const fire of fires) {
      const d = new Date(fire.ms)
      const expectedTop = d.getHours() * 60 + d.getMinutes()
      expect(fire.top).toBe(expectedTop)
    }
  })

  it('all fire times fall within the week', () => {
    const weekStart = new Date(2026, 2, 8, 0, 0, 0, 0)
    const weekEnd = weekStart.getTime() + 7 * 86400000
    const job: CronJob = {
      id: 'j4',
      name: 'every-6h',
      schedule: { kind: 'every', everyMs: 21600000 },
      createdAt: '2026-03-01T00:00:00Z',
    }
    const fires = getFireTimesInWeek(job, weekStart)
    expect(fires.length).toBeGreaterThan(0)
    for (const fire of fires) {
      expect(fire.ms).toBeGreaterThanOrEqual(weekStart.getTime())
      expect(fire.ms).toBeLessThan(weekEnd)
    }
  })

  it('uses nextRunAtMs as anchor when available', () => {
    const weekStart = new Date(2026, 2, 8, 0, 0, 0, 0)
    const anchor = weekStart.getTime() + 3600000 // 1 hour after week start
    const job: CronJob = {
      id: 'j5',
      name: 'anchored',
      schedule: { kind: 'every', everyMs: 86400000 },
      state: { nextRunAtMs: anchor },
    }
    const fires = getFireTimesInWeek(job, weekStart)
    expect(fires.length).toBeGreaterThan(0)
    // First fire should align with the anchor offset
    const d = new Date(fires[0].ms)
    expect(d.getHours()).toBe(1) // 1 AM (1 hour offset)
  })
})
