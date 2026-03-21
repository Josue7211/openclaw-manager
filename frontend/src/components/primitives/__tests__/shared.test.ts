import { describe, it, expect } from 'vitest'
import {
  configString,
  configNumber,
  configBool,
  configArray,
  resolveColor,
  COLOR_MAP,
} from '../shared'

describe('configString', () => {
  it('returns string value when present', () => {
    expect(configString({ title: 'Hello' }, 'title', 'default')).toBe('Hello')
  })

  it('returns empty string when value is empty string', () => {
    expect(configString({ title: '' }, 'title', 'default')).toBe('')
  })

  it('returns fallback when key is missing', () => {
    expect(configString({}, 'title', 'default')).toBe('default')
  })

  it('returns fallback when value is a number', () => {
    expect(configString({ title: 42 }, 'title', 'default')).toBe('default')
  })

  it('returns fallback when value is null', () => {
    expect(configString({ title: null }, 'title', 'default')).toBe('default')
  })

  it('returns fallback when value is undefined', () => {
    expect(configString({ title: undefined }, 'title', 'default')).toBe('default')
  })

  it('returns fallback when value is boolean', () => {
    expect(configString({ title: true }, 'title', 'default')).toBe('default')
  })
})

describe('configNumber', () => {
  it('returns number value when present', () => {
    expect(configNumber({ count: 42 }, 'count', 0)).toBe(42)
  })

  it('returns zero when value is zero', () => {
    expect(configNumber({ count: 0 }, 'count', 99)).toBe(0)
  })

  it('returns negative numbers', () => {
    expect(configNumber({ count: -5 }, 'count', 0)).toBe(-5)
  })

  it('returns fallback when key is missing', () => {
    expect(configNumber({}, 'count', 99)).toBe(99)
  })

  it('returns fallback when value is NaN', () => {
    expect(configNumber({ count: NaN }, 'count', 99)).toBe(99)
  })

  it('returns fallback when value is Infinity', () => {
    expect(configNumber({ count: Infinity }, 'count', 99)).toBe(99)
  })

  it('returns fallback when value is -Infinity', () => {
    expect(configNumber({ count: -Infinity }, 'count', 99)).toBe(99)
  })

  it('returns fallback when value is a string', () => {
    expect(configNumber({ count: '42' }, 'count', 99)).toBe(99)
  })

  it('returns fallback when value is null', () => {
    expect(configNumber({ count: null }, 'count', 99)).toBe(99)
  })
})

describe('configBool', () => {
  it('returns true when value is true', () => {
    expect(configBool({ enabled: true }, 'enabled', false)).toBe(true)
  })

  it('returns false when value is false', () => {
    expect(configBool({ enabled: false }, 'enabled', true)).toBe(false)
  })

  it('returns fallback when key is missing', () => {
    expect(configBool({}, 'enabled', true)).toBe(true)
  })

  it('returns fallback when value is a truthy string', () => {
    expect(configBool({ enabled: 'true' }, 'enabled', false)).toBe(false)
  })

  it('returns fallback when value is a number', () => {
    expect(configBool({ enabled: 1 }, 'enabled', false)).toBe(false)
  })

  it('returns fallback when value is null', () => {
    expect(configBool({ enabled: null }, 'enabled', true)).toBe(true)
  })
})

describe('configArray', () => {
  it('returns array when value is an array', () => {
    expect(configArray<number>({ items: [1, 2, 3] }, 'items')).toEqual([1, 2, 3])
  })

  it('returns empty array for empty array value', () => {
    expect(configArray({ items: [] }, 'items')).toEqual([])
  })

  it('returns empty array when key is missing', () => {
    expect(configArray({}, 'items')).toEqual([])
  })

  it('returns empty array when value is a string', () => {
    expect(configArray({ items: 'not-array' }, 'items')).toEqual([])
  })

  it('returns empty array when value is null', () => {
    expect(configArray({ items: null }, 'items')).toEqual([])
  })

  it('returns empty array when value is an object', () => {
    expect(configArray({ items: { a: 1 } }, 'items')).toEqual([])
  })

  it('preserves typed array contents', () => {
    const result = configArray<{ name: string }>({ items: [{ name: 'a' }] }, 'items')
    expect(result).toEqual([{ name: 'a' }])
    expect(result[0].name).toBe('a')
  })
})

describe('resolveColor', () => {
  it('maps "accent" to var(--accent)', () => {
    expect(resolveColor('accent')).toBe('var(--accent)')
  })

  it('maps "red" to var(--red)', () => {
    expect(resolveColor('red')).toBe('var(--red)')
  })

  it('maps "amber" to var(--amber)', () => {
    expect(resolveColor('amber')).toBe('var(--amber)')
  })

  it('maps "green" to var(--secondary)', () => {
    expect(resolveColor('green')).toBe('var(--secondary)')
  })

  it('maps "blue" to var(--tertiary)', () => {
    expect(resolveColor('blue')).toBe('var(--tertiary)')
  })

  it('maps "secondary" to var(--secondary)', () => {
    expect(resolveColor('secondary')).toBe('var(--secondary)')
  })

  it('maps "tertiary" to var(--tertiary)', () => {
    expect(resolveColor('tertiary')).toBe('var(--tertiary)')
  })

  it('falls back to var(--accent) for unknown keys', () => {
    expect(resolveColor('nonexistent')).toBe('var(--accent)')
  })

  it('falls back to var(--accent) for empty string', () => {
    expect(resolveColor('')).toBe('var(--accent)')
  })
})

describe('COLOR_MAP', () => {
  it('contains all expected keys', () => {
    const expectedKeys = [
      'accent', 'accent-dim',
      'secondary', 'secondary-dim',
      'tertiary', 'tertiary-dim',
      'red', 'amber', 'green', 'blue',
    ]
    for (const key of expectedKeys) {
      expect(COLOR_MAP).toHaveProperty(key)
    }
  })
})
