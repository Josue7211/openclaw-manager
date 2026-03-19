export interface CronSchedule {
  kind: string
  everyMs?: number
  expr?: string
}

export interface CronState {
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastRunStatus?: string
}

export interface CronJob {
  id: string
  name: string
  description?: string
  schedule: CronSchedule
  state?: CronState
  createdAtMs?: number
  createdAt?: string
  enabled?: boolean
}

export const COLORS = ['var(--purple)', 'var(--blue)', 'var(--green-400)', 'var(--orange)', 'var(--pink)', 'var(--cyan)', 'var(--yellow-bright)']
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const HOUR_HEIGHT = 60 // px per hour (60px = 60min, 1px per minute)
export const TOTAL_HEIGHT = 24 * HOUR_HEIGHT // 1440px
export const FREQUENT_MS = 3600000 // < 1 hour = too frequent for grid

export const navBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  borderRadius: '6px',
  color: 'var(--text-secondary)',
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: '12px',
  whiteSpace: 'nowrap',
}

export function humanSchedule(job: CronJob): string {
  const s = job.schedule
  if (s.kind === 'every' && s.everyMs) {
    const ms = s.everyMs
    const hours = ms / 3600000
    if (hours >= 24 && hours % 24 === 0) return `every ${hours / 24}d`
    if (hours >= 1) return `every ${hours % 1 === 0 ? hours : hours.toFixed(1)}h`
    const mins = ms / 60000
    if (mins >= 1) return `every ${mins % 1 === 0 ? mins : mins.toFixed(0)}m`
    return `every ${ms}ms`
  }
  if (s.kind === 'cron' && s.expr) return s.expr
  return s.kind || 'unknown'
}

export function relativeTime(ms: number): string {
  const diff = ms - Date.now()
  const abs = Math.abs(diff)
  const past = diff < 0
  if (abs < 60000) return past ? 'just now' : 'in <1m'
  if (abs < 3600000) {
    const m = Math.round(abs / 60000)
    return past ? `${m}m ago` : `in ${m}m`
  }
  if (abs < 86400000) {
    const h = Math.round(abs / 3600000)
    return past ? `${h}h ago` : `in ${h}h`
  }
  const d = Math.round(abs / 86400000)
  return past ? `${d}d ago` : `in ${d}d`
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function formatWeekLabel(weekStart: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `Week of ${weekStart.toLocaleDateString(undefined, opts)}`
}

export interface FireTime {
  ms: number
  dayIndex: number
  top: number // px from top of day column
}

export function getFireTimesInWeek(job: CronJob, weekStart: Date): FireTime[] {
  const fires: FireTime[] = []
  const weekStartMs = weekStart.getTime()
  const weekEndMs = weekStartMs + 7 * 24 * 3600000
  const s = job.schedule

  if (s.kind === 'every' && s.everyMs) {
    const interval = s.everyMs
    const anchor =
      job.state?.nextRunAtMs ??
      job.createdAtMs ??
      (job.createdAt ? new Date(job.createdAt).getTime() : Date.now())

    let t = anchor
    if (t >= weekStartMs) {
      while (t - interval >= weekStartMs) t -= interval
    } else {
      const steps = Math.ceil((weekStartMs - t) / interval)
      t += steps * interval
    }

    while (t < weekEndMs) {
      if (t >= weekStartMs) {
        const d = new Date(t)
        const hours = d.getHours()
        const minutes = d.getMinutes()
        fires.push({
          ms: t,
          dayIndex: d.getDay(),
          top: hours * 60 + minutes, // 1px per minute
        })
      }
      t += interval
    }
  }

  return fires
}
