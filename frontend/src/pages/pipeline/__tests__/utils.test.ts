import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatNextRun, formatDate, formatMonth, formatDay, daysAgo, groupByMonth } from '../utils'
import type { ChangelogEntry } from '../types'

/* ─── helpers ──────────────────────────────────────────────────────────── */

function makeEntry(overrides: Partial<ChangelogEntry> = {}): ChangelogEntry {
  return {
    id: 'entry-1',
    title: 'Test entry',
    date: '2026-03-10',
    description: 'A changelog entry',
    tags: ['fix'],
    created_at: '2026-03-10T12:00:00Z',
    ...overrides,
  }
}

/* ─── formatNextRun ───────────────────────────────────────────────────── */

describe('formatNextRun', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns em dash for undefined input', () => {
    expect(formatNextRun()).toBe('\u2014')
  })

  it('returns em dash for empty string', () => {
    expect(formatNextRun('')).toBe('\u2014')
  })

  it('returns "overdue" for past dates', () => {
    expect(formatNextRun('2026-03-15T11:00:00Z')).toBe('overdue')
  })

  it('returns hours and minutes for future dates > 1 hour away', () => {
    const result = formatNextRun('2026-03-15T14:30:00Z')
    expect(result).toBe('in 2h 30m')
  })

  it('returns only minutes for future dates < 1 hour away', () => {
    const result = formatNextRun('2026-03-15T12:45:00Z')
    expect(result).toBe('in 45m')
  })

  it('returns "in 0m" for a date just barely in the future', () => {
    const result = formatNextRun('2026-03-15T12:00:10Z')
    expect(result).toBe('in 0m')
  })

  it('handles exactly 1 hour in the future', () => {
    const result = formatNextRun('2026-03-15T13:00:00Z')
    expect(result).toBe('in 1h 0m')
  })
})

/* ─── formatDate ──────────────────────────────────────────────────────── */

describe('formatDate', () => {
  it('formats a date string as short month, day, and year', () => {
    const result = formatDate('2026-03-15T12:00:00Z')
    expect(result).toContain('Mar')
    expect(result).toContain('15')
    expect(result).toContain('2026')
  })

  it('handles a different month and year', () => {
    const result = formatDate('2025-12-15T12:00:00Z')
    expect(result).toContain('Dec')
    expect(result).toContain('2025')
  })
})

/* ─── formatMonth ─────────────────────────────────────────────────────── */

describe('formatMonth', () => {
  it('returns full month name and year for a YYYY-MM-DD string', () => {
    const result = formatMonth('2026-03-15')
    expect(result).toContain('March')
    expect(result).toContain('2026')
  })

  it('handles January correctly', () => {
    const result = formatMonth('2026-01-01')
    expect(result).toContain('January')
    expect(result).toContain('2026')
  })

  it('handles December correctly', () => {
    const result = formatMonth('2025-12-31')
    expect(result).toContain('December')
    expect(result).toContain('2025')
  })
})

/* ─── formatDay ───────────────────────────────────────────────────────── */

describe('formatDay', () => {
  it('returns short month and day for a YYYY-MM-DD string', () => {
    const result = formatDay('2026-03-15')
    expect(result).toContain('Mar')
    expect(result).toContain('15')
  })

  it('does not include the year', () => {
    const result = formatDay('2026-03-15')
    expect(result).not.toContain('2026')
  })

  it('handles single-digit days', () => {
    const result = formatDay('2026-01-05')
    expect(result).toContain('Jan')
    expect(result).toContain('5')
  })
})

/* ─── daysAgo ─────────────────────────────────────────────────────────── */

describe('daysAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 for today', () => {
    expect(daysAgo('2026-03-15T12:00:00Z')).toBe(0)
  })

  it('returns 1 for yesterday (24 hours ago)', () => {
    expect(daysAgo('2026-03-14T12:00:00Z')).toBe(1)
  })

  it('returns 7 for a week ago', () => {
    expect(daysAgo('2026-03-08T12:00:00Z')).toBe(7)
  })

  it('handles partial days (floors the result)', () => {
    // 36 hours ago = 1.5 days, should floor to 1
    expect(daysAgo('2026-03-14T00:00:00Z')).toBe(1)
  })
})

/* ─── groupByMonth ────────────────────────────────────────────────────── */

describe('groupByMonth', () => {
  it('returns empty object for empty array', () => {
    expect(groupByMonth([])).toEqual({})
  })

  it('groups entries in the same month together', () => {
    const entries = [
      makeEntry({ id: '1', date: '2026-03-01' }),
      makeEntry({ id: '2', date: '2026-03-15' }),
    ]
    const groups = groupByMonth(entries)
    const keys = Object.keys(groups)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain('March')
    expect(keys[0]).toContain('2026')
    expect(groups[keys[0]]).toHaveLength(2)
  })

  it('separates entries from different months', () => {
    const entries = [
      makeEntry({ id: '1', date: '2026-02-15' }),
      makeEntry({ id: '2', date: '2026-03-10' }),
    ]
    const groups = groupByMonth(entries)
    const keys = Object.keys(groups)
    expect(keys).toHaveLength(2)
    expect(keys).toEqual(expect.arrayContaining([
      expect.stringContaining('February'),
      expect.stringContaining('March'),
    ]))
  })

  it('separates entries from different years', () => {
    const entries = [
      makeEntry({ id: '1', date: '2025-12-20' }),
      makeEntry({ id: '2', date: '2026-01-05' }),
    ]
    const groups = groupByMonth(entries)
    const keys = Object.keys(groups)
    expect(keys).toHaveLength(2)
    expect(keys).toEqual(expect.arrayContaining([
      expect.stringContaining('2025'),
      expect.stringContaining('2026'),
    ]))
  })

  it('preserves entry order within each group', () => {
    const entries = [
      makeEntry({ id: '1', date: '2026-03-01', title: 'First' }),
      makeEntry({ id: '2', date: '2026-03-15', title: 'Second' }),
      makeEntry({ id: '3', date: '2026-03-20', title: 'Third' }),
    ]
    const groups = groupByMonth(entries)
    const marchKey = Object.keys(groups)[0]
    expect(groups[marchKey][0].title).toBe('First')
    expect(groups[marchKey][1].title).toBe('Second')
    expect(groups[marchKey][2].title).toBe('Third')
  })
})
