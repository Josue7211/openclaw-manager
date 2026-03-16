import { describe, it, expect, beforeEach } from 'vitest'

let getReadOverrides: typeof import('../readOverrides').getReadOverrides
let setReadOverride: typeof import('../readOverrides').setReadOverride
let clearReadOverride: typeof import('../readOverrides').clearReadOverride

beforeEach(async () => {
  // Re-import to get a fresh module-level Map each time
  const { vi } = await import('vitest')
  vi.resetModules()
  const mod = await import('../readOverrides')
  getReadOverrides = mod.getReadOverrides
  setReadOverride = mod.setReadOverride
  clearReadOverride = mod.clearReadOverride
})

describe('getReadOverrides', () => {
  it('returns an empty map initially', () => {
    const overrides = getReadOverrides()
    expect(overrides.size).toBe(0)
  })

  it('returns the same map reference on multiple calls', () => {
    expect(getReadOverrides()).toBe(getReadOverrides())
  })
})

describe('setReadOverride', () => {
  it('adds an override entry', () => {
    setReadOverride('conv-1', true)
    expect(getReadOverrides().get('conv-1')).toBe(true)
  })

  it('overwrites an existing entry', () => {
    setReadOverride('conv-1', true)
    setReadOverride('conv-1', false)
    expect(getReadOverrides().get('conv-1')).toBe(false)
  })

  it('supports multiple distinct guids', () => {
    setReadOverride('conv-1', true)
    setReadOverride('conv-2', false)
    expect(getReadOverrides().size).toBe(2)
    expect(getReadOverrides().get('conv-1')).toBe(true)
    expect(getReadOverrides().get('conv-2')).toBe(false)
  })
})

describe('clearReadOverride', () => {
  it('removes a previously set override', () => {
    setReadOverride('conv-1', true)
    clearReadOverride('conv-1')
    expect(getReadOverrides().has('conv-1')).toBe(false)
  })

  it('does not throw when clearing a non-existent guid', () => {
    expect(() => clearReadOverride('nonexistent')).not.toThrow()
  })

  it('does not affect other overrides', () => {
    setReadOverride('conv-1', true)
    setReadOverride('conv-2', false)
    clearReadOverride('conv-1')
    expect(getReadOverrides().size).toBe(1)
    expect(getReadOverrides().get('conv-2')).toBe(false)
  })
})
