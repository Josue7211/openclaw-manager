/**
 * ThemeScheduler — UI for sunrise/sunset auto-switch and manual time ranges.
 *
 * Supports two mutually exclusive modes:
 *   1. Sunrise/sunset: auto-switch between day and night themes
 *   2. Manual: user-defined time ranges with specific themes
 */

import { useState, useCallback, memo, useMemo } from 'react'
import { BUILT_IN_THEMES } from '@/lib/theme-definitions'
import type { ThemeSchedule } from '@/lib/theme-definitions'
import { approximateSunTimes } from '@/lib/theme-scheduling'
import { setSchedule, useThemeState } from '@/lib/theme-store'
import Toggle from '@/pages/settings/Toggle'
import { Trash } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function padHour(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseTimeInput(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':').map(Number)
  return { hour: h || 0, minute: m || 0 }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ThemeScheduler = memo(function ThemeScheduler() {
  const themeState = useThemeState()
  const schedule = themeState.schedule

  const isSunrise = schedule?.type === 'sunrise-sunset'
  const isManual = schedule?.type === 'manual'

  // Approximate sunrise/sunset for display
  const sunTimes = useMemo(() => approximateSunTimes(new Date()), [])

  // All theme options for dropdowns
  const themeOptions = useMemo(() => {
    return [
      ...BUILT_IN_THEMES,
      ...themeState.customThemes,
    ]
  }, [themeState.customThemes])

  // ---------------------------------------------------------------------------
  // Sunrise/Sunset toggle
  // ---------------------------------------------------------------------------

  const handleSunriseToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      setSchedule({
        type: 'sunrise-sunset',
        sunriseSunset: {
          dayThemeId: schedule?.sunriseSunset?.dayThemeId || 'default-light',
          nightThemeId: schedule?.sunriseSunset?.nightThemeId || 'default-dark',
        },
      })
    } else {
      setSchedule({ type: 'none' })
    }
  }, [schedule])

  const handleDayThemeChange = useCallback((themeId: string) => {
    setSchedule({
      type: 'sunrise-sunset',
      sunriseSunset: {
        dayThemeId: themeId,
        nightThemeId: schedule?.sunriseSunset?.nightThemeId || 'default-dark',
      },
    })
  }, [schedule])

  const handleNightThemeChange = useCallback((themeId: string) => {
    setSchedule({
      type: 'sunrise-sunset',
      sunriseSunset: {
        dayThemeId: schedule?.sunriseSunset?.dayThemeId || 'default-light',
        nightThemeId: themeId,
      },
    })
  }, [schedule])

  // ---------------------------------------------------------------------------
  // Manual toggle
  // ---------------------------------------------------------------------------

  const [manualRanges, setManualRanges] = useState<ThemeSchedule['manual']>(
    () => schedule?.manual || [
      { startHour: 6, startMinute: 0, endHour: 18, endMinute: 0, themeId: 'default-light' },
      { startHour: 18, startMinute: 0, endHour: 6, endMinute: 0, themeId: 'default-dark' },
    ]
  )

  const handleManualToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      setSchedule({
        type: 'manual',
        manual: manualRanges,
      })
    } else {
      setSchedule({ type: 'none' })
    }
  }, [manualRanges])

  const updateManualRange = useCallback((
    index: number,
    field: 'start' | 'end' | 'themeId',
    value: string,
  ) => {
    setManualRanges(prev => {
      const updated = [...(prev || [])]
      const range = { ...updated[index] }

      if (field === 'start') {
        const { hour, minute } = parseTimeInput(value)
        range.startHour = hour
        range.startMinute = minute
      } else if (field === 'end') {
        const { hour, minute } = parseTimeInput(value)
        range.endHour = hour
        range.endMinute = minute
      } else {
        range.themeId = value
      }

      updated[index] = range

      if (isManual) {
        setSchedule({ type: 'manual', manual: updated })
      }

      return updated
    })
  }, [isManual])

  const addRange = useCallback(() => {
    setManualRanges(prev => {
      const updated = [...(prev || []), {
        startHour: 0,
        startMinute: 0,
        endHour: 0,
        endMinute: 0,
        themeId: 'default-dark',
      }]
      if (isManual) {
        setSchedule({ type: 'manual', manual: updated })
      }
      return updated
    })
  }, [isManual])

  const removeRange = useCallback((index: number) => {
    setManualRanges(prev => {
      const updated = (prev || []).filter((_, i) => i !== index)
      if (isManual) {
        setSchedule({ type: 'manual', manual: updated })
      }
      return updated
    })
  }, [isManual])

  // Check if there are gaps in manual ranges coverage
  const hasGaps = useMemo(() => {
    if (!isManual || !manualRanges || manualRanges.length === 0) return false
    // Simple heuristic: if total covered minutes don't add up to ~1440 (24h), there's a gap
    let totalMinutes = 0
    for (const r of manualRanges) {
      const start = r.startHour * 60 + r.startMinute
      const end = r.endHour * 60 + r.endMinute
      if (start <= end) {
        totalMinutes += end - start
      } else {
        totalMinutes += (1440 - start) + end
      }
    }
    return totalMinutes < 1430 // Allow 10 min tolerance
  }, [isManual, manualRanges])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sunrise/Sunset Auto-Switch */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
            Auto switch at sunrise/sunset
          </label>
          <Toggle
            on={isSunrise}
            onToggle={handleSunriseToggle}
            label="Auto switch at sunrise/sunset"
          />
        </div>

        {isSunrise && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '12px',
            background: 'var(--bg-card)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '90px' }}>
                Day theme
              </label>
              <select
                aria-label="Day theme"
                value={schedule?.sunriseSunset?.dayThemeId || 'default-light'}
                onChange={e => handleDayThemeChange(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: 'var(--bg-card-solid)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                {themeOptions.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '90px' }}>
                Night theme
              </label>
              <select
                aria-label="Night theme"
                value={schedule?.sunriseSunset?.nightThemeId || 'default-dark'}
                onChange={e => handleNightThemeChange(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: 'var(--bg-card-solid)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                {themeOptions.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Sunrise ~{formatTime(sunTimes.sunrise)}, Sunset ~{formatTime(sunTimes.sunset)}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border)' }} />

      {/* Manual Time Ranges */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
            Use custom schedule
          </label>
          <Toggle
            on={isManual}
            onToggle={handleManualToggle}
            label="Use custom schedule"
          />
        </div>

        {isManual && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px',
            background: 'var(--bg-card)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}>
            {(manualRanges || []).map((range, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="time"
                  value={padHour(range.startHour, range.startMinute)}
                  onChange={e => updateManualRange(index, 'start', e.target.value)}
                  aria-label={`Start time for range ${index + 1}`}
                  style={{
                    padding: '6px 8px',
                    background: 'var(--bg-card-solid)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>to</span>
                <input
                  type="time"
                  value={padHour(range.endHour, range.endMinute)}
                  onChange={e => updateManualRange(index, 'end', e.target.value)}
                  aria-label={`End time for range ${index + 1}`}
                  style={{
                    padding: '6px 8px',
                    background: 'var(--bg-card-solid)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
                <select
                  value={range.themeId}
                  onChange={e => updateManualRange(index, 'themeId', e.target.value)}
                  aria-label={`Theme for range ${index + 1}`}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    background: 'var(--bg-card-solid)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                >
                  {themeOptions.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeRange(index)}
                  aria-label={`Remove time range ${index + 1}`}
                  style={{
                    padding: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash size={16} />
                </button>
              </div>
            ))}

            <button
              onClick={addRange}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                color: 'var(--accent)',
                fontSize: '13px',
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              Add Time Range
            </button>

            {hasGaps && (
              <div style={{
                fontSize: '12px',
                color: 'var(--warning)',
                marginTop: '4px',
              }}>
                Warning: Your time ranges don't cover all 24 hours. Unmatched times will keep the current theme.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

export default ThemeScheduler
