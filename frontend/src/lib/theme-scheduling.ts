/**
 * Theme Scheduling — sunrise/sunset calculation and schedule-driven theme switching.
 *
 * Provides:
 *   - approximateSunTimes(date): Calculate approximate sunrise/sunset from date alone
 *     (no geolocation needed — assumes ~40 degrees latitude)
 *   - checkSchedule(schedule, now?): Check which theme should be active given a schedule
 *   - startScheduleTimer(): Start a 60-second polling interval that auto-switches themes
 *   - stopScheduleTimer(): Stop the polling interval
 */

import type { ThemeSchedule } from './theme-definitions'
import { getThemeState, setActiveTheme } from './theme-store'

// ---------------------------------------------------------------------------
// approximateSunTimes
// ---------------------------------------------------------------------------

/**
 * Calculate approximate sunrise/sunset times for a given date.
 *
 * Uses the solar declination formula with an assumed latitude of ~40 degrees
 * (covers most of the US, Europe, East Asia). Accuracy is +/- 30 minutes,
 * which is sufficient for theme scheduling.
 *
 * No geolocation API is needed — only the date matters.
 */
export function approximateSunTimes(date: Date): { sunrise: Date; sunset: Date } {
  // Day of year (1-based)
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000)

  // Assume ~40 degrees latitude (mid-latitude, covers most users)
  const approxLat = 40

  // Solar declination (simplified formula)
  const declination = -23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10))

  const latRad = (approxLat * Math.PI) / 180
  const declRad = (declination * Math.PI) / 180

  // Hour angle at sunrise/sunset
  const cosHourAngle = -Math.tan(latRad) * Math.tan(declRad)
  // Clamp to [-1, 1] to avoid NaN near poles (not our case at 40 deg, but defensive)
  const clamped = Math.max(-1, Math.min(1, cosHourAngle))
  const hourAngle = Math.acos(clamped)

  // Hours of daylight
  const hoursOfDaylight = (2 * hourAngle * 180) / (Math.PI * 15)

  // Solar noon is approximately 12:00 local time
  const solarNoon = 12
  const sunriseHour = solarNoon - hoursOfDaylight / 2
  const sunsetHour = solarNoon + hoursOfDaylight / 2

  const sunrise = new Date(date)
  sunrise.setHours(Math.floor(sunriseHour), Math.round((sunriseHour % 1) * 60), 0, 0)

  const sunset = new Date(date)
  sunset.setHours(Math.floor(sunsetHour), Math.round((sunsetHour % 1) * 60), 0, 0)

  return { sunrise, sunset }
}

// ---------------------------------------------------------------------------
// checkSchedule
// ---------------------------------------------------------------------------

/**
 * Given a ThemeSchedule and the current time, return which theme ID should
 * be active, or null if no schedule applies.
 */
export function checkSchedule(schedule: ThemeSchedule | undefined, now?: Date): string | null {
  if (!schedule || schedule.type === 'none') return null

  const currentTime = now ?? new Date()

  if (schedule.type === 'sunrise-sunset' && schedule.sunriseSunset) {
    const { sunrise, sunset } = approximateSunTimes(currentTime)
    const isDay = currentTime >= sunrise && currentTime < sunset
    return isDay ? schedule.sunriseSunset.dayThemeId : schedule.sunriseSunset.nightThemeId
  }

  if (schedule.type === 'manual' && schedule.manual) {
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

    for (const range of schedule.manual) {
      const startMinutes = range.startHour * 60 + range.startMinute
      const endMinutes = range.endHour * 60 + range.endMinute

      if (startMinutes <= endMinutes) {
        // Normal range (e.g. 06:00 to 18:00)
        if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
          return range.themeId
        }
      } else {
        // Wrap-around range (e.g. 22:00 to 06:00)
        if (nowMinutes >= startMinutes || nowMinutes < endMinutes) {
          return range.themeId
        }
      }
    }

    return null
  }

  return null
}

// ---------------------------------------------------------------------------
// Schedule Timer
// ---------------------------------------------------------------------------

let _intervalId: ReturnType<typeof setInterval> | null = null

/**
 * Start a 60-second polling interval that checks the schedule and
 * auto-switches themes when needed. Returns a cleanup function.
 */
export function startScheduleTimer(): () => void {
  // Clear any existing timer
  stopScheduleTimer()

  const tick = () => {
    const state = getThemeState()
    const result = checkSchedule(state.schedule)
    if (result && result !== state.activeThemeId) {
      // No click event — system-triggered switch uses center ripple (or instant)
      setActiveTheme(result)
    }
  }

  // Check immediately on start
  tick()

  // Then check every 60 seconds
  _intervalId = setInterval(tick, 60_000)

  return () => stopScheduleTimer()
}

/**
 * Stop the schedule timer interval.
 */
export function stopScheduleTimer(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId)
    _intervalId = null
  }
}
