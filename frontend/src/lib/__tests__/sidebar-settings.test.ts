import { describe, it, expect, vi, beforeEach } from 'vitest'

let getSidebarHeaderVisible: typeof import('../sidebar-settings').getSidebarHeaderVisible
let setSidebarHeaderVisible: typeof import('../sidebar-settings').setSidebarHeaderVisible
let subscribeSidebarSettings: typeof import('../sidebar-settings').subscribeSidebarSettings

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('../sidebar-settings')
  getSidebarHeaderVisible = mod.getSidebarHeaderVisible
  setSidebarHeaderVisible = mod.setSidebarHeaderVisible
  subscribeSidebarSettings = mod.subscribeSidebarSettings
})

describe('getSidebarHeaderVisible', () => {
  it('defaults to true when localStorage is empty', () => {
    expect(getSidebarHeaderVisible()).toBe(true)
  })

  it('returns false when localStorage has "false"', async () => {
    localStorage.setItem('sidebar-header-visible', 'false')
    vi.resetModules()
    const mod = await import('../sidebar-settings')
    expect(mod.getSidebarHeaderVisible()).toBe(false)
  })
})

describe('setSidebarHeaderVisible', () => {
  it('persists false to localStorage and updates getter', () => {
    setSidebarHeaderVisible(false)
    expect(getSidebarHeaderVisible()).toBe(false)
    expect(localStorage.getItem('sidebar-header-visible')).toBe('false')
  })

  it('persists true to localStorage', () => {
    setSidebarHeaderVisible(false)
    setSidebarHeaderVisible(true)
    expect(getSidebarHeaderVisible()).toBe(true)
    expect(localStorage.getItem('sidebar-header-visible')).toBe('true')
  })

  it('fires listeners on change', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)
    setSidebarHeaderVisible(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('subscribeSidebarSettings', () => {
  it('fires callback when value changes', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)
    setSidebarHeaderVisible(false)
    setSidebarHeaderVisible(true)
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('returns an unsubscribe function that stops notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeSidebarSettings(cb)
    unsub()
    setSidebarHeaderVisible(false)
    expect(cb).not.toHaveBeenCalled()
  })

  it('supports multiple listeners independently', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    subscribeSidebarSettings(cb1)
    const unsub2 = subscribeSidebarSettings(cb2)

    setSidebarHeaderVisible(false)
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)

    unsub2()
    setSidebarHeaderVisible(true)
    expect(cb1).toHaveBeenCalledTimes(2)
    expect(cb2).toHaveBeenCalledTimes(1) // no longer called
  })
})
