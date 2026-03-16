import { describe, it, expect } from 'vitest'
import { statusColor, formatElapsed, hexToRgba, formatDuration, EVENT_META } from '../utils'

describe('statusColor', () => {
  it('returns green for done', () => {
    expect(statusColor('done')).toBe('var(--green-400)')
  })

  it('returns accent for active', () => {
    expect(statusColor('active')).toBe('var(--accent-bright)')
  })

  it('returns amber for awaiting_review', () => {
    expect(statusColor('awaiting_review')).toBe('var(--amber)')
  })

  it('returns red for failed', () => {
    expect(statusColor('failed')).toBe('var(--red-500)')
  })

  it('returns muted for pending', () => {
    expect(statusColor('pending')).toBe('var(--text-muted)')
  })

  it('returns muted for unknown status', () => {
    expect(statusColor('unknown')).toBe('var(--text-muted)')
  })

  it('returns muted for empty string', () => {
    expect(statusColor('')).toBe('var(--text-muted)')
  })
})

describe('formatElapsed', () => {
  it('formats zero seconds', () => {
    expect(formatElapsed(0)).toBe('+0:00')
  })

  it('formats seconds under a minute', () => {
    expect(formatElapsed(5)).toBe('+0:05')
    expect(formatElapsed(59)).toBe('+0:59')
  })

  it('formats exact minutes', () => {
    expect(formatElapsed(60)).toBe('+1:00')
    expect(formatElapsed(120)).toBe('+2:00')
  })

  it('formats minutes and seconds', () => {
    expect(formatElapsed(90)).toBe('+1:30')
    expect(formatElapsed(125)).toBe('+2:05')
  })

  it('pads single-digit seconds', () => {
    expect(formatElapsed(61)).toBe('+1:01')
    expect(formatElapsed(69)).toBe('+1:09')
  })

  it('handles large values', () => {
    expect(formatElapsed(3661)).toBe('+61:01')
  })

  it('handles fractional seconds by flooring', () => {
    expect(formatElapsed(90.7)).toBe('+1:30')
    expect(formatElapsed(59.999)).toBe('+0:59')
  })
})

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('formats seconds only when under a minute', () => {
    expect(formatDuration(5)).toBe('5s')
    expect(formatDuration(59)).toBe('59s')
  })

  it('formats exact minutes', () => {
    expect(formatDuration(60)).toBe('1m 0s')
    expect(formatDuration(120)).toBe('2m 0s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s')
    expect(formatDuration(125)).toBe('2m 5s')
  })

  it('handles large values', () => {
    expect(formatDuration(3661)).toBe('61m 1s')
  })

  it('handles fractional seconds by flooring', () => {
    expect(formatDuration(90.7)).toBe('1m 30s')
  })
})

describe('hexToRgba', () => {
  it('converts black with full opacity', () => {
    expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)')
  })

  it('converts white with full opacity', () => {
    expect(hexToRgba('#ffffff', 1)).toBe('rgba(255,255,255,1)')
  })

  it('converts white with partial opacity', () => {
    expect(hexToRgba('#ffffff', 0.5)).toBe('rgba(255,255,255,0.5)')
  })

  it('converts a color with zero opacity', () => {
    expect(hexToRgba('#ff0000', 0)).toBe('rgba(255,0,0,0)')
  })

  it('converts arbitrary hex colors', () => {
    expect(hexToRgba('#3b82f6', 0.15)).toBe('rgba(59,130,246,0.15)')
  })

  it('converts uppercase hex', () => {
    expect(hexToRgba('#FF00FF', 0.8)).toBe('rgba(255,0,255,0.8)')
  })

  it('handles mixed case hex', () => {
    expect(hexToRgba('#aAbBcC', 1)).toBe('rgba(170,187,204,1)')
  })
})

describe('EVENT_META', () => {
  const expectedKeys = ['user', 'think', 'write', 'edit', 'bash', 'read', 'glob', 'grep', 'result']

  it('has entries for all known event types', () => {
    for (const key of expectedKeys) {
      expect(EVENT_META).toHaveProperty(key)
    }
  })

  it('each entry has required fields', () => {
    for (const key of expectedKeys) {
      const entry = EVENT_META[key]
      expect(entry).toHaveProperty('tickColor')
      expect(entry).toHaveProperty('icon')
      expect(entry).toHaveProperty('label')
      expect(entry).toHaveProperty('labelColor')
      expect(entry).toHaveProperty('bg')
      expect(entry).toHaveProperty('border')
    }
  })

  it('labels are capitalized single words', () => {
    for (const key of expectedKeys) {
      const label = EVENT_META[key].label
      expect(label.length).toBeGreaterThan(0)
      expect(label[0]).toBe(label[0].toUpperCase())
    }
  })

  it('glob and grep share the same tick color', () => {
    expect(EVENT_META.glob.tickColor).toBe(EVENT_META.grep.tickColor)
  })
})
