import { describe, it, expect } from 'vitest'
import {
  PALETTE,
  DAY_LABELS,
  MONTH_NAMES,
  GRID_START,
  GRID_END,
  calendarColor,
  toDateKey,
  parseLocalDate,
  isoToMinutes,
  formatTime,
  weekStart,
  addDays,
  addMonths,
} from '../shared'
import type { CalendarEvent, CalendarResponse } from '../shared'

/* ─── Constants ──────────────────────────────────────────────────────── */

describe('PALETTE', () => {
  it('has 9 color entries', () => {
    expect(PALETTE).toHaveLength(9)
  })

  it('every entry is a non-empty string', () => {
    for (const c of PALETTE) {
      expect(typeof c).toBe('string')
      expect(c.length).toBeGreaterThan(0)
    }
  })

  it('contains both CSS variable and hex colors', () => {
    const hasVar = PALETTE.some(c => c.startsWith('var('))
    const hasHex = PALETTE.some(c => c.startsWith('#'))
    expect(hasVar).toBe(true)
    expect(hasHex).toBe(true)
  })
})

describe('DAY_LABELS', () => {
  it('has 7 entries', () => {
    expect(DAY_LABELS).toHaveLength(7)
  })

  it('starts with Mon and ends with Sun', () => {
    expect(DAY_LABELS[0]).toBe('Mon')
    expect(DAY_LABELS[6]).toBe('Sun')
  })

  it('contains all weekday abbreviations', () => {
    expect(DAY_LABELS).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })
})

describe('MONTH_NAMES', () => {
  it('has 12 entries', () => {
    expect(MONTH_NAMES).toHaveLength(12)
  })

  it('starts with January and ends with December', () => {
    expect(MONTH_NAMES[0]).toBe('January')
    expect(MONTH_NAMES[11]).toBe('December')
  })

  it('all names are capitalized full month names', () => {
    for (const name of MONTH_NAMES) {
      expect(name[0]).toBe(name[0].toUpperCase())
      expect(name.length).toBeGreaterThan(2)
    }
  })
})

describe('GRID_START / GRID_END', () => {
  it('GRID_START is 5 (5 AM)', () => {
    expect(GRID_START).toBe(5)
  })

  it('GRID_END is 23 (11 PM)', () => {
    expect(GRID_END).toBe(23)
  })

  it('GRID_END is greater than GRID_START', () => {
    expect(GRID_END).toBeGreaterThan(GRID_START)
  })
})

/* ─── calendarColor ──────────────────────────────────────────────────── */

describe('calendarColor', () => {
  it('returns a string from PALETTE', () => {
    const color = calendarColor('Work')
    expect(PALETTE).toContain(color)
  })

  it('returns the same color for the same name', () => {
    expect(calendarColor('Personal')).toBe(calendarColor('Personal'))
  })

  it('returns different colors for different names (usually)', () => {
    // With 9 palette entries, short distinct strings should differ
    const colors = new Set(['Work', 'Personal', 'Health', 'Finance', 'School'].map(calendarColor))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('handles empty string without crashing', () => {
    const color = calendarColor('')
    expect(PALETTE).toContain(color)
  })

  it('handles long strings', () => {
    const color = calendarColor('A very long calendar name that goes on and on')
    expect(PALETTE).toContain(color)
  })
})

/* ─── toDateKey ──────────────────────────────────────────────────────── */

describe('toDateKey', () => {
  it('extracts YYYY-MM-DD from an ISO datetime', () => {
    expect(toDateKey('2026-03-15T14:30:00Z')).toBe('2026-03-15')
  })

  it('returns the string itself when already a date key', () => {
    expect(toDateKey('2026-01-01')).toBe('2026-01-01')
  })

  it('works with ISO string with offset', () => {
    expect(toDateKey('2026-06-20T08:00:00+05:00')).toBe('2026-06-20')
  })

  it('returns a 10-character string', () => {
    expect(toDateKey('2026-12-31T23:59:59Z')).toHaveLength(10)
  })
})

/* ─── parseLocalDate ─────────────────────────────────────────────────── */

describe('parseLocalDate', () => {
  it('returns a Date for a 10-char date string', () => {
    const d = parseLocalDate('2026-03-15')
    expect(d).toBeInstanceOf(Date)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2) // March = 2
    expect(d.getDate()).toBe(15)
  })

  it('treats 10-char date as local noon (avoids UTC shift)', () => {
    const d = parseLocalDate('2026-03-15')
    expect(d.getHours()).toBe(12)
    expect(d.getMinutes()).toBe(0)
  })

  it('parses full ISO datetime directly', () => {
    const d = parseLocalDate('2026-03-15T14:30:00Z')
    expect(d).toBeInstanceOf(Date)
    expect(d.getFullYear()).toBe(2026)
  })

  it('does not add T12:00:00 to full datetimes', () => {
    const d = parseLocalDate('2026-06-01T00:00:00Z')
    // Should not be noon — it should be whatever the UTC time maps to locally
    expect(d.getTime()).toBe(new Date('2026-06-01T00:00:00Z').getTime())
  })
})

/* ─── isoToMinutes ───────────────────────────────────────────────────── */

describe('isoToMinutes', () => {
  it('returns 0 for midnight local time', () => {
    // Use a local-timezone string to avoid UTC offset issues
    const d = new Date(2026, 2, 15, 0, 0)
    expect(isoToMinutes(d.toISOString())).toBe(0)
  })

  it('returns 150 for 2:30 AM local', () => {
    const d = new Date(2026, 2, 15, 2, 30)
    expect(isoToMinutes(d.toISOString())).toBe(150)
  })

  it('returns 1439 for 23:59 local', () => {
    const d = new Date(2026, 2, 15, 23, 59)
    expect(isoToMinutes(d.toISOString())).toBe(1439)
  })
})

/* ─── formatTime ─────────────────────────────────────────────────────── */

describe('formatTime', () => {
  it('returns "All day" for a 10-char date string', () => {
    expect(formatTime('2026-03-15')).toBe('All day')
  })

  it('returns a time string for a full datetime', () => {
    const result = formatTime('2026-03-15T14:30:00')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toBe('All day')
  })
})

/* ─── weekStart ──────────────────────────────────────────────────────── */

describe('weekStart', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-03-11 is a Wednesday
    const wed = new Date(2026, 2, 11, 15, 30)
    const mon = weekStart(wed)
    expect(mon.getDay()).toBe(1) // Monday
    expect(mon.getDate()).toBe(9)
  })

  it('returns Monday itself for a Monday', () => {
    // 2026-03-09 is a Monday
    const mon = new Date(2026, 2, 9, 10, 0)
    const result = weekStart(mon)
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(9)
  })

  it('returns previous Monday for a Sunday', () => {
    // 2026-03-15 is a Sunday
    const sun = new Date(2026, 2, 15, 10, 0)
    const result = weekStart(sun)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(9)
  })

  it('zeroes out time components', () => {
    const d = new Date(2026, 2, 11, 14, 30, 45, 123)
    const result = weekStart(d)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })

  it('does not mutate the original date', () => {
    const original = new Date(2026, 2, 11, 15, 30)
    const originalTime = original.getTime()
    weekStart(original)
    expect(original.getTime()).toBe(originalTime)
  })
})

/* ─── addDays ────────────────────────────────────────────────────────── */

describe('addDays', () => {
  it('adds positive days', () => {
    const d = new Date(2026, 2, 15)
    const result = addDays(d, 3)
    expect(result.getDate()).toBe(18)
  })

  it('subtracts with negative days', () => {
    const d = new Date(2026, 2, 15)
    const result = addDays(d, -5)
    expect(result.getDate()).toBe(10)
  })

  it('handles month boundary', () => {
    const d = new Date(2026, 2, 30) // March 30
    const result = addDays(d, 3) // April 2
    expect(result.getMonth()).toBe(3) // April
    expect(result.getDate()).toBe(2)
  })

  it('adding 0 days returns the same date', () => {
    const d = new Date(2026, 2, 15)
    const result = addDays(d, 0)
    expect(result.getDate()).toBe(15)
  })

  it('does not mutate the original date', () => {
    const d = new Date(2026, 2, 15)
    const originalTime = d.getTime()
    addDays(d, 10)
    expect(d.getTime()).toBe(originalTime)
  })
})

/* ─── addMonths ──────────────────────────────────────────────────────── */

describe('addMonths', () => {
  it('adds positive months', () => {
    const d = new Date(2026, 0, 15) // Jan 15
    const result = addMonths(d, 3) // Apr 15
    expect(result.getMonth()).toBe(3)
    expect(result.getDate()).toBe(15)
  })

  it('subtracts with negative months', () => {
    const d = new Date(2026, 5, 15) // June 15
    const result = addMonths(d, -2) // April 15
    expect(result.getMonth()).toBe(3)
  })

  it('handles year boundary', () => {
    const d = new Date(2026, 11, 15) // Dec 15
    const result = addMonths(d, 2) // Feb 15, 2027
    expect(result.getFullYear()).toBe(2027)
    expect(result.getMonth()).toBe(1)
  })

  it('adding 0 months returns the same month', () => {
    const d = new Date(2026, 5, 15)
    const result = addMonths(d, 0)
    expect(result.getMonth()).toBe(5)
  })

  it('does not mutate the original date', () => {
    const d = new Date(2026, 2, 15)
    const originalTime = d.getTime()
    addMonths(d, 6)
    expect(d.getTime()).toBe(originalTime)
  })
})

/* ─── Type structural validation ─────────────────────────────────────── */

describe('type exports', () => {
  it('CalendarEvent type is structurally valid', () => {
    const event: CalendarEvent = {
      id: 'ev-1',
      title: 'Team standup',
      start: '2026-03-15T09:00:00Z',
      end: '2026-03-15T09:30:00Z',
      allDay: false,
      calendar: 'Work',
    }
    expect(event.id).toBeTruthy()
    expect(event.allDay).toBe(false)
  })

  it('CalendarEvent all-day event', () => {
    const event: CalendarEvent = {
      id: 'ev-2',
      title: 'Holiday',
      start: '2026-03-15',
      end: '2026-03-15',
      allDay: true,
      calendar: 'Personal',
    }
    expect(event.allDay).toBe(true)
  })

  it('CalendarResponse with events', () => {
    const resp: CalendarResponse = {
      events: [
        { id: '1', title: 'Test', start: '2026-03-15', end: '2026-03-15', allDay: true, calendar: 'Cal' },
      ],
    }
    expect(resp.events).toHaveLength(1)
    expect(resp.error).toBeUndefined()
  })

  it('CalendarResponse with error', () => {
    const resp: CalendarResponse = {
      error: 'Unauthorized',
      message: 'Token expired',
    }
    expect(resp.error).toBe('Unauthorized')
    expect(resp.events).toBeUndefined()
  })
})
