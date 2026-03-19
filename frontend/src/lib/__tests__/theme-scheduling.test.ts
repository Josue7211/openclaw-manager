/**
 * Tests for theme-scheduling.ts — sunrise/sunset calculation and schedule checker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { approximateSunTimes, checkSchedule } from '../theme-scheduling'
import type { ThemeSchedule } from '../theme-definitions'

describe('approximateSunTimes', () => {
  it('returns sunrise between 4:30-6:30 and sunset between 19:00-21:00 for June 21 (summer solstice)', () => {
    const june21 = new Date(2026, 5, 21, 12, 0) // June 21
    const { sunrise, sunset } = approximateSunTimes(june21)

    const sunriseHour = sunrise.getHours() + sunrise.getMinutes() / 60
    const sunsetHour = sunset.getHours() + sunset.getMinutes() / 60

    expect(sunriseHour).toBeGreaterThanOrEqual(4.5)
    expect(sunriseHour).toBeLessThanOrEqual(6.5)
    expect(sunsetHour).toBeGreaterThanOrEqual(19.0)
    expect(sunsetHour).toBeLessThanOrEqual(21.0)
  })

  it('returns sunrise between 7:00-8:30 and sunset between 16:00-17:30 for Dec 21 (winter solstice)', () => {
    const dec21 = new Date(2026, 11, 21, 12, 0) // Dec 21
    const { sunrise, sunset } = approximateSunTimes(dec21)

    const sunriseHour = sunrise.getHours() + sunrise.getMinutes() / 60
    const sunsetHour = sunset.getHours() + sunset.getMinutes() / 60

    expect(sunriseHour).toBeGreaterThanOrEqual(7.0)
    expect(sunriseHour).toBeLessThanOrEqual(8.5)
    expect(sunsetHour).toBeGreaterThanOrEqual(16.0)
    expect(sunsetHour).toBeLessThanOrEqual(17.5)
  })

  it('returns sunrise ~6:00 and sunset ~18:00 for March 21 (equinox)', () => {
    const march21 = new Date(2026, 2, 21, 12, 0) // March 21
    const { sunrise, sunset } = approximateSunTimes(march21)

    const sunriseHour = sunrise.getHours() + sunrise.getMinutes() / 60
    const sunsetHour = sunset.getHours() + sunset.getMinutes() / 60

    // Equinox: roughly 12 hours of daylight, sunrise near 6, sunset near 18
    expect(sunriseHour).toBeGreaterThanOrEqual(5.5)
    expect(sunriseHour).toBeLessThanOrEqual(6.5)
    expect(sunsetHour).toBeGreaterThanOrEqual(17.5)
    expect(sunsetHour).toBeLessThanOrEqual(18.5)
  })
})

describe('checkSchedule', () => {
  it('returns null when schedule type is none', () => {
    const schedule: ThemeSchedule = { type: 'none' }
    expect(checkSchedule(schedule)).toBeNull()
  })

  it('returns null when schedule is undefined', () => {
    expect(checkSchedule(undefined)).toBeNull()
  })

  it('returns dayThemeId at 10:00 AM for sunrise-sunset schedule', () => {
    const schedule: ThemeSchedule = {
      type: 'sunrise-sunset',
      sunriseSunset: { dayThemeId: 'default-light', nightThemeId: 'default-dark' },
    }
    // 10 AM on equinox -- clearly daytime
    const now = new Date(2026, 2, 21, 10, 0)
    expect(checkSchedule(schedule, now)).toBe('default-light')
  })

  it('returns nightThemeId at 10:00 PM for sunrise-sunset schedule', () => {
    const schedule: ThemeSchedule = {
      type: 'sunrise-sunset',
      sunriseSunset: { dayThemeId: 'default-light', nightThemeId: 'default-dark' },
    }
    // 10 PM on equinox -- clearly nighttime
    const now = new Date(2026, 2, 21, 22, 0)
    expect(checkSchedule(schedule, now)).toBe('default-dark')
  })

  it('returns matching themeId for manual time range', () => {
    const schedule: ThemeSchedule = {
      type: 'manual',
      manual: [
        { startHour: 6, startMinute: 0, endHour: 18, endMinute: 0, themeId: 'solarized-light' },
        { startHour: 18, startMinute: 0, endHour: 6, endMinute: 0, themeId: 'nord' },
      ],
    }
    // 12:00 noon -- should match the first range
    const now = new Date(2026, 2, 21, 12, 0)
    expect(checkSchedule(schedule, now)).toBe('solarized-light')
  })

  it('returns matching themeId for manual time range with midnight wrap-around', () => {
    const schedule: ThemeSchedule = {
      type: 'manual',
      manual: [
        { startHour: 22, startMinute: 0, endHour: 6, endMinute: 0, themeId: 'dracula' },
      ],
    }
    // 2 AM -- should match the wrap-around range
    const now = new Date(2026, 2, 21, 2, 0)
    expect(checkSchedule(schedule, now)).toBe('dracula')
  })

  it('returns null when no manual range matches', () => {
    const schedule: ThemeSchedule = {
      type: 'manual',
      manual: [
        { startHour: 8, startMinute: 0, endHour: 12, endMinute: 0, themeId: 'solarized-light' },
      ],
    }
    // 15:00 -- outside the only range
    const now = new Date(2026, 2, 21, 15, 0)
    expect(checkSchedule(schedule, now)).toBeNull()
  })
})
