export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  calendar: string
}

export interface CalendarResponse {
  events?: CalendarEvent[]
  error?: string
  message?: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

export const PALETTE = [
  'var(--purple)', '#5865f2', '#3ba55c', '#ed4245', 'var(--amber-warm)',
  '#57d687', '#818cf8', '#b9a8ff', '#ff6467',
]

export function calendarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function toDateKey(iso: string): string {
  return iso.slice(0, 10)
}

export function parseLocalDate(iso: string): Date {
  // Avoid UTC shift by treating "YYYY-MM-DD" as local noon
  if (iso.length === 10) return new Date(iso + 'T12:00:00')
  return new Date(iso)
}

export function isoToMinutes(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export function formatTime(iso: string): string {
  if (iso.length === 10) return 'All day'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Monday of the week containing `date` */
export function weekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

export const GRID_START = 5   // 5 AM
export const GRID_END   = 23  // 11 PM  (last row label = 11 PM)
