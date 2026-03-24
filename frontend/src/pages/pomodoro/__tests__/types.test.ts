import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_DURATIONS,
  MODE_LABELS,
  MIN_CELL_SIZE,
  MAX_CELL_SIZE,
  CELL_GAP,
  STORAGE_KEY,
  MIN_WEEKS,
  MONTH_NAMES,
  loadSessions,
  saveSessions,
  todayStr,
  toDateKey,
  getHeatColor,
  buildHeatmapGrid,
} from '../types'
import type { Mode, SessionEntry } from '../types'

describe('constants', () => {
  it('DEFAULT_DURATIONS has values for all modes', () => {
    const modes: Mode[] = ['work', 'short', 'long']
    for (const mode of modes) {
      expect(DEFAULT_DURATIONS[mode]).toBeGreaterThan(0)
    }
  })

  it('work duration is longer than short and long breaks', () => {
    expect(DEFAULT_DURATIONS.work).toBeGreaterThan(DEFAULT_DURATIONS.short)
    expect(DEFAULT_DURATIONS.work).toBeGreaterThan(DEFAULT_DURATIONS.long)
  })

  it('long break is longer than short break', () => {
    expect(DEFAULT_DURATIONS.long).toBeGreaterThan(DEFAULT_DURATIONS.short)
  })

  it('MODE_LABELS has human-readable labels for all modes', () => {
    expect(MODE_LABELS.work).toBe('Work')
    expect(MODE_LABELS.short).toBe('Short Break')
    expect(MODE_LABELS.long).toBe('Long Break')
  })

  it('MIN_CELL_SIZE is less than MAX_CELL_SIZE', () => {
    expect(MIN_CELL_SIZE).toBeLessThan(MAX_CELL_SIZE)
  })

  it('CELL_GAP is a positive number', () => {
    expect(CELL_GAP).toBeGreaterThan(0)
  })

  it('MONTH_NAMES has 12 entries', () => {
    expect(MONTH_NAMES).toHaveLength(12)
  })

  it('MONTH_NAMES are 3-letter abbreviations', () => {
    for (const name of MONTH_NAMES) {
      expect(name).toHaveLength(3)
      expect(name[0]).toBe(name[0].toUpperCase())
    }
  })

  it('MIN_WEEKS is at least 1', () => {
    expect(MIN_WEEKS).toBeGreaterThanOrEqual(1)
  })

  it('STORAGE_KEY is a non-empty string', () => {
    expect(typeof STORAGE_KEY).toBe('string')
    expect(STORAGE_KEY.length).toBeGreaterThan(0)
  })
})

describe('loadSessions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array when nothing stored', () => {
    expect(loadSessions()).toEqual([])
  })

  it('returns parsed sessions from localStorage', () => {
    const sessions: SessionEntry[] = [
      { id: '1', completedAt: '2026-01-01', type: 'work', duration: 25 },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    expect(loadSessions()).toEqual(sessions)
  })

  it('returns empty array on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{bad json')
    expect(loadSessions()).toEqual([])
  })
})

describe('saveSessions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists sessions to localStorage', () => {
    const sessions: SessionEntry[] = [
      { id: 'a', completedAt: '2026-03-15', type: 'short', duration: 5 },
    ]
    saveSessions(sessions)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(sessions)
  })

  it('overwrites previous data', () => {
    saveSessions([{ id: '1', completedAt: '2026-01-01', type: 'work', duration: 25 }])
    saveSessions([{ id: '2', completedAt: '2026-01-02', type: 'short', duration: 5 }])
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('2')
  })

  it('roundtrips through loadSessions', () => {
    const sessions: SessionEntry[] = [
      { id: 'x', completedAt: '2026-03-10', type: 'long', duration: 15 },
      { id: 'y', completedAt: '2026-03-11', type: 'work', duration: 25 },
    ]
    saveSessions(sessions)
    expect(loadSessions()).toEqual(sessions)
  })
})

describe('todayStr', () => {
  it('returns a non-empty string', () => {
    const result = todayStr()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('matches Date().toDateString() format', () => {
    expect(todayStr()).toBe(new Date().toDateString())
  })
})

describe('toDateKey', () => {
  it('returns YYYY-MM-DD format', () => {
    const date = new Date('2026-03-15T14:30:00Z')
    expect(toDateKey(date)).toBe('2026-03-15')
  })

  it('pads single-digit months and days', () => {
    const date = new Date('2026-01-05T00:00:00Z')
    expect(toDateKey(date)).toBe('2026-01-05')
  })

  it('returns a 10-character string', () => {
    expect(toDateKey(new Date())).toHaveLength(10)
  })

  it('matches ISO date prefix', () => {
    const date = new Date()
    expect(toDateKey(date)).toBe(date.toISOString().slice(0, 10))
  })
})

describe('getHeatColor', () => {
  it('returns elevated bg for 0', () => {
    expect(getHeatColor(0)).toBe('var(--bg-elevated)')
  })

  it('returns purple-a30 for 1', () => {
    expect(getHeatColor(1)).toBe('var(--purple-a30)')
  })

  it('returns purple-tinted color for 2', () => {
    expect(getHeatColor(2)).toMatch(/purple|rgba/)
  })

  it('returns purple-tinted color for 3', () => {
    expect(getHeatColor(3)).toMatch(/purple|rgba/)
  })

  it('returns accent-bright for 4 or more', () => {
    expect(getHeatColor(4)).toBe('var(--accent-bright)')
    expect(getHeatColor(10)).toBe('var(--accent-bright)')
    expect(getHeatColor(100)).toBe('var(--accent-bright)')
  })
})

describe('buildHeatmapGrid', () => {
  it('returns the correct number of weeks', () => {
    const { weeks } = buildHeatmapGrid(13)
    expect(weeks).toHaveLength(13)
  })

  it('each week has 7 days', () => {
    const { weeks } = buildHeatmapGrid(5)
    for (const week of weeks) {
      expect(week).toHaveLength(7)
    }
  })

  it('all entries are Date objects', () => {
    const { weeks } = buildHeatmapGrid(4)
    for (const week of weeks) {
      for (const day of week) {
        expect(day).toBeInstanceOf(Date)
      }
    }
  })

  it('today is returned with zeroed time', () => {
    const { today } = buildHeatmapGrid(1)
    expect(today.getHours()).toBe(0)
    expect(today.getMinutes()).toBe(0)
    expect(today.getSeconds()).toBe(0)
    expect(today.getMilliseconds()).toBe(0)
  })

  it('first day of each week is Monday', () => {
    const { weeks } = buildHeatmapGrid(10)
    for (const week of weeks) {
      // getDay: 0=Sun, 1=Mon
      expect(week[0].getDay()).toBe(1)
    }
  })

  it('last day of each week is Sunday', () => {
    const { weeks } = buildHeatmapGrid(10)
    for (const week of weeks) {
      expect(week[6].getDay()).toBe(0)
    }
  })

  it('weeks are in chronological order', () => {
    const { weeks } = buildHeatmapGrid(8)
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i][0].getTime()).toBeGreaterThan(weeks[i - 1][0].getTime())
    }
  })

  it('consecutive days within a week differ by 1 day', () => {
    const { weeks } = buildHeatmapGrid(3)
    for (const week of weeks) {
      for (let d = 1; d < 7; d++) {
        const diff = week[d].getTime() - week[d - 1].getTime()
        expect(diff).toBe(24 * 60 * 60 * 1000)
      }
    }
  })

  it('last week contains today', () => {
    const { today, weeks } = buildHeatmapGrid(5)
    const lastWeek = weeks[weeks.length - 1]
    const todayKey = today.toISOString().slice(0, 10)
    const lastWeekKeys = lastWeek.map(d => d.toISOString().slice(0, 10))
    expect(lastWeekKeys).toContain(todayKey)
  })

  it('returns 1 week when numWeeks is 1', () => {
    const { weeks } = buildHeatmapGrid(1)
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toHaveLength(7)
  })
})
