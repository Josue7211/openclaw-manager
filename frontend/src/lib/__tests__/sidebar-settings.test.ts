import { describe, it, expect, vi, beforeEach } from 'vitest'

let getSidebarHeaderVisible: typeof import('../sidebar-settings').getSidebarHeaderVisible
let setSidebarHeaderVisible: typeof import('../sidebar-settings').setSidebarHeaderVisible
let getSidebarDefaultWidth: typeof import('../sidebar-settings').getSidebarDefaultWidth
let setSidebarDefaultWidth: typeof import('../sidebar-settings').setSidebarDefaultWidth
let getSidebarTitleLayout: typeof import('../sidebar-settings').getSidebarTitleLayout
let setSidebarTitleLayout: typeof import('../sidebar-settings').setSidebarTitleLayout
let getSidebarTitleText: typeof import('../sidebar-settings').getSidebarTitleText
let setSidebarTitleText: typeof import('../sidebar-settings').setSidebarTitleText
let getSidebarLogoVisible: typeof import('../sidebar-settings').getSidebarLogoVisible
let setSidebarLogoVisible: typeof import('../sidebar-settings').setSidebarLogoVisible
let getSidebarTitleSize: typeof import('../sidebar-settings').getSidebarTitleSize
let setSidebarTitleSize: typeof import('../sidebar-settings').setSidebarTitleSize
let getSidebarSearchVisible: typeof import('../sidebar-settings').getSidebarSearchVisible
let setSidebarSearchVisible: typeof import('../sidebar-settings').setSidebarSearchVisible
let subscribeSidebarSettings: typeof import('../sidebar-settings').subscribeSidebarSettings

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('../sidebar-settings')
  getSidebarHeaderVisible = mod.getSidebarHeaderVisible
  setSidebarHeaderVisible = mod.setSidebarHeaderVisible
  getSidebarDefaultWidth = mod.getSidebarDefaultWidth
  setSidebarDefaultWidth = mod.setSidebarDefaultWidth
  getSidebarTitleLayout = mod.getSidebarTitleLayout
  setSidebarTitleLayout = mod.setSidebarTitleLayout
  getSidebarTitleText = mod.getSidebarTitleText
  setSidebarTitleText = mod.setSidebarTitleText
  getSidebarLogoVisible = mod.getSidebarLogoVisible
  setSidebarLogoVisible = mod.setSidebarLogoVisible
  getSidebarTitleSize = mod.getSidebarTitleSize
  setSidebarTitleSize = mod.setSidebarTitleSize
  getSidebarSearchVisible = mod.getSidebarSearchVisible
  setSidebarSearchVisible = mod.setSidebarSearchVisible
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

describe('getSidebarDefaultWidth / setSidebarDefaultWidth', () => {
  it('defaults to 320 when localStorage is empty', () => {
    expect(getSidebarDefaultWidth()).toBe(320)
  })

  it('reads persisted width from localStorage', async () => {
    localStorage.setItem('sidebar-default-width', '250')
    vi.resetModules()
    const mod = await import('../sidebar-settings')
    expect(mod.getSidebarDefaultWidth()).toBe(250)
  })

  it('persists width to localStorage', () => {
    setSidebarDefaultWidth(280)
    expect(getSidebarDefaultWidth()).toBe(280)
    expect(localStorage.getItem('sidebar-default-width')).toBe('280')
  })

  it('clamps width to minimum of 100', () => {
    setSidebarDefaultWidth(50)
    expect(getSidebarDefaultWidth()).toBe(100)
  })

  it('clamps width to maximum of 400', () => {
    setSidebarDefaultWidth(500)
    expect(getSidebarDefaultWidth()).toBe(400)
  })

  it('fires listeners on change', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)
    setSidebarDefaultWidth(300)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('getSidebarTitleLayout / setSidebarTitleLayout', () => {
  it('defaults to "one-line" when localStorage is empty', () => {
    expect(getSidebarTitleLayout()).toBe('one-line')
  })

  it('reads persisted layout from localStorage', async () => {
    localStorage.setItem('sidebar-title-layout', 'two-line')
    vi.resetModules()
    const mod = await import('../sidebar-settings')
    expect(mod.getSidebarTitleLayout()).toBe('two-line')
  })

  it('persists layout to localStorage', () => {
    setSidebarTitleLayout('two-line')
    expect(getSidebarTitleLayout()).toBe('two-line')
    expect(localStorage.getItem('sidebar-title-layout')).toBe('two-line')
  })

  it('fires listeners on change', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)
    setSidebarTitleLayout('two-line')
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('getSidebarTitleText / setSidebarTitleText', () => {
  it('defaults to "OPENCLAW" when localStorage is empty', () => {
    expect(getSidebarTitleText()).toBe('OPENCLAW')
  })

  it('reads persisted text from localStorage', async () => {
    localStorage.setItem('sidebar-title-text', 'MY APP')
    vi.resetModules()
    const mod = await import('../sidebar-settings')
    expect(mod.getSidebarTitleText()).toBe('MY APP')
  })

  it('persists text to localStorage', () => {
    setSidebarTitleText('CUSTOM')
    expect(getSidebarTitleText()).toBe('CUSTOM')
    expect(localStorage.getItem('sidebar-title-text')).toBe('CUSTOM')
  })

  it('does not persist empty/whitespace text to localStorage but still updates getter', () => {
    setSidebarTitleText('CUSTOM')
    setSidebarTitleText('   ')
    // The getter reflects the new value
    expect(getSidebarTitleText()).toBe('   ')
    // But localStorage still has the last non-empty value
    expect(localStorage.getItem('sidebar-title-text')).toBe('CUSTOM')
  })

  it('fires listeners on change', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)
    setSidebarTitleText('NEW')
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('getSidebarLogoVisible / setSidebarLogoVisible', () => {
  it('defaults to true when localStorage is empty', () => {
    expect(getSidebarLogoVisible()).toBe(true)
  })

  it('returns false when localStorage has "false"', async () => {
    localStorage.setItem('sidebar-logo-visible', 'false')
    vi.resetModules()
    const mod = await import('../sidebar-settings')
    expect(mod.getSidebarLogoVisible()).toBe(false)
  })

  it('persists value to localStorage', () => {
    setSidebarLogoVisible(false)
    expect(getSidebarLogoVisible()).toBe(false)
    expect(localStorage.getItem('sidebar-logo-visible')).toBe('false')
  })

  it('fires listeners on change', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)
    setSidebarLogoVisible(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('getSidebarTitleSize / setSidebarTitleSize', () => {
  it('defaults to 22 when localStorage is empty', () => {
    expect(getSidebarTitleSize()).toBe(22)
  })

  it('reads persisted size from localStorage', async () => {
    localStorage.setItem('sidebar-title-size', '18')
    vi.resetModules()
    const mod = await import('../sidebar-settings')
    expect(mod.getSidebarTitleSize()).toBe(18)
  })

  it('persists size to localStorage', () => {
    setSidebarTitleSize(30)
    expect(getSidebarTitleSize()).toBe(30)
    expect(localStorage.getItem('sidebar-title-size')).toBe('30')
  })

  it('clamps size to minimum of 10', () => {
    setSidebarTitleSize(5)
    expect(getSidebarTitleSize()).toBe(10)
  })

  it('clamps size to maximum of 40', () => {
    setSidebarTitleSize(50)
    expect(getSidebarTitleSize()).toBe(40)
  })

  it('fires listeners on change', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)
    setSidebarTitleSize(28)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('getSidebarSearchVisible / setSidebarSearchVisible', () => {
  it('defaults to true when localStorage is empty', () => {
    expect(getSidebarSearchVisible()).toBe(true)
  })

  it('returns false when localStorage has "false"', async () => {
    localStorage.setItem('sidebar-search-visible', 'false')
    vi.resetModules()
    const mod = await import('../sidebar-settings')
    expect(mod.getSidebarSearchVisible()).toBe(false)
  })

  it('persists value to localStorage', () => {
    setSidebarSearchVisible(false)
    expect(getSidebarSearchVisible()).toBe(false)
    expect(localStorage.getItem('sidebar-search-visible')).toBe('false')
  })

  it('fires listeners on change', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)
    setSidebarSearchVisible(false)
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

  it('fires for any setter, not just header visibility', () => {
    const cb = vi.fn()
    subscribeSidebarSettings(cb)

    setSidebarDefaultWidth(200)
    setSidebarTitleLayout('two-line')
    setSidebarTitleText('HI')
    setSidebarLogoVisible(false)
    setSidebarTitleSize(16)
    setSidebarSearchVisible(false)

    expect(cb).toHaveBeenCalledTimes(6)
  })
})
