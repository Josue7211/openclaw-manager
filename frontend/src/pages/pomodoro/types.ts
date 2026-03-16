export type Mode = 'work' | 'short' | 'long'

export interface SessionEntry {
  id: string
  completedAt: string
  type: 'work' | 'short' | 'long'
  duration: number
}

export const DEFAULT_DURATIONS: Record<Mode, number> = {
  work: 25,
  short: 5,
  long: 15,
}

export const MODE_LABELS: Record<Mode, string> = {
  work: 'Work',
  short: 'Short Break',
  long: 'Long Break',
}

export const MIN_CELL_SIZE = 4
export const MAX_CELL_SIZE = 50
export const CELL_SIZE_STORAGE_KEY = 'pomodoro-heatmap-cellsize'
export const CELL_GAP = 2
export const STORAGE_KEY = 'pomodoro-sessions'
export const MIN_WEEKS = 13
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function playChime(type: 'work' | 'break') {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const freqs = type === 'work' ? [523, 659, 784] : [784, 659, 523]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.22
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      osc.start(t)
      osc.stop(t + 0.55)
    })
  } catch {
    // Audio not supported — silent fail
  }
}

export function loadSessions(): SessionEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveSessions(sessions: SessionEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function todayStr() {
  return new Date().toDateString()
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getHeatColor(count: number): string {
  if (count === 0) return 'var(--bg-elevated)'
  if (count === 1) return 'var(--purple-a30)'
  if (count === 2) return 'rgba(155, 132, 236, 0.55)'
  if (count === 3) return 'rgba(155, 132, 236, 0.75)'
  return 'var(--accent-bright)'
}

// Build heatmap grid: numWeeks columns, Mon–Sun rows
export function buildHeatmapGrid(numWeeks: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Monday of current week
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const currentMonday = new Date(today)
  currentMonday.setDate(today.getDate() - daysFromMonday)

  const startMonday = new Date(currentMonday)
  startMonday.setDate(currentMonday.getDate() - 7 * (numWeeks - 1))

  const weeks: Date[][] = []
  for (let w = 0; w < numWeeks; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(startMonday)
      date.setDate(startMonday.getDate() + w * 7 + d)
      week.push(date)
    }
    weeks.push(week)
  }
  return { today, weeks }
}
