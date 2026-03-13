import { describe, it, expect, vi, beforeEach } from 'vitest'
import { timeAgo, formatTime } from '../utils'

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-13T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Never" for null input', () => {
    expect(timeAgo(null)).toBe('Never')
  })

  it('returns seconds ago for recent timestamps', () => {
    const thirtySecondsAgo = new Date('2026-03-13T11:59:30Z').toISOString()
    expect(timeAgo(thirtySecondsAgo)).toBe('30s ago')
  })

  it('returns minutes ago for timestamps within the hour', () => {
    const tenMinutesAgo = new Date('2026-03-13T11:50:00Z').toISOString()
    expect(timeAgo(tenMinutesAgo)).toBe('10m ago')
  })

  it('returns hours ago for timestamps within the day', () => {
    const threeHoursAgo = new Date('2026-03-13T09:00:00Z').toISOString()
    expect(timeAgo(threeHoursAgo)).toBe('3h ago')
  })

  it('returns days ago for timestamps beyond 24 hours', () => {
    const twoDaysAgo = new Date('2026-03-11T12:00:00Z').toISOString()
    expect(timeAgo(twoDaysAgo)).toBe('2d ago')
  })

  it('returns 0s ago for the current moment', () => {
    const now = new Date('2026-03-13T12:00:00Z').toISOString()
    expect(timeAgo(now)).toBe('0s ago')
  })
})

describe('formatTime', () => {
  it('returns dash for null input', () => {
    expect(formatTime(null)).toBe('\u2014')
  })

  it('returns a formatted time string for a valid ISO date', () => {
    const iso = '2026-03-13T14:30:00Z'
    const result = formatTime(iso)
    // The exact output depends on the locale, but it should contain digits
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })
})
