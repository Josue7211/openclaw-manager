import { describe, it, expect, vi, beforeEach } from 'vitest'

let getTitleBarVisible: typeof import('../titlebar-settings').getTitleBarVisible
let setTitleBarVisible: typeof import('../titlebar-settings').setTitleBarVisible
let getTitleBarAutoHide: typeof import('../titlebar-settings').getTitleBarAutoHide
let setTitleBarAutoHide: typeof import('../titlebar-settings').setTitleBarAutoHide
let subscribeTitleBarSettings: typeof import('../titlebar-settings').subscribeTitleBarSettings

async function loadModule() {
  vi.resetModules()
  const mod = await import('../titlebar-settings')
  getTitleBarVisible = mod.getTitleBarVisible
  setTitleBarVisible = mod.setTitleBarVisible
  getTitleBarAutoHide = mod.getTitleBarAutoHide
  setTitleBarAutoHide = mod.setTitleBarAutoHide
  subscribeTitleBarSettings = mod.subscribeTitleBarSettings
}

beforeEach(async () => {
  localStorage.clear()
  await loadModule()
})

describe('getTitleBarVisible', () => {
  it('defaults to true when localStorage is empty', () => {
    expect(getTitleBarVisible()).toBe(true)
  })

  it('returns false when localStorage has "false"', async () => {
    localStorage.setItem('title-bar-visible', 'false')
    await loadModule()
    expect(getTitleBarVisible()).toBe(false)
  })

  it('returns true when localStorage has "true"', async () => {
    localStorage.setItem('title-bar-visible', 'true')
    await loadModule()
    expect(getTitleBarVisible()).toBe(true)
  })
})

describe('setTitleBarVisible', () => {
  it('updates the cached value', () => {
    setTitleBarVisible(false)
    expect(getTitleBarVisible()).toBe(false)
  })

  it('persists to localStorage', () => {
    setTitleBarVisible(false)
    expect(localStorage.getItem('title-bar-visible')).toBe('false')
  })

  it('notifies subscribers', () => {
    const cb = vi.fn()
    subscribeTitleBarSettings(cb)
    setTitleBarVisible(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('can toggle back to true', () => {
    setTitleBarVisible(false)
    setTitleBarVisible(true)
    expect(getTitleBarVisible()).toBe(true)
    expect(localStorage.getItem('title-bar-visible')).toBe('true')
  })
})

describe('getTitleBarAutoHide', () => {
  it('defaults to false when localStorage is empty', () => {
    expect(getTitleBarAutoHide()).toBe(false)
  })

  it('returns true when localStorage has true', async () => {
    localStorage.setItem('titlebar-autohide', JSON.stringify(true))
    await loadModule()
    expect(getTitleBarAutoHide()).toBe(true)
  })

  it('returns false on invalid JSON', async () => {
    localStorage.setItem('titlebar-autohide', 'not-json')
    await loadModule()
    expect(getTitleBarAutoHide()).toBe(false)
  })
})

describe('setTitleBarAutoHide', () => {
  it('updates the cached value', () => {
    setTitleBarAutoHide(true)
    expect(getTitleBarAutoHide()).toBe(true)
  })

  it('persists to localStorage as JSON', () => {
    setTitleBarAutoHide(true)
    expect(JSON.parse(localStorage.getItem('titlebar-autohide')!)).toBe(true)
  })

  it('notifies subscribers', () => {
    const cb = vi.fn()
    subscribeTitleBarSettings(cb)
    setTitleBarAutoHide(true)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('subscribeTitleBarSettings', () => {
  it('fires callback on visibility change', () => {
    const cb = vi.fn()
    subscribeTitleBarSettings(cb)
    setTitleBarVisible(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires callback on auto-hide change', () => {
    const cb = vi.fn()
    subscribeTitleBarSettings(cb)
    setTitleBarAutoHide(true)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('returns an unsubscribe function that stops notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeTitleBarSettings(cb)
    unsub()
    setTitleBarVisible(false)
    setTitleBarAutoHide(true)
    expect(cb).not.toHaveBeenCalled()
  })

  it('multiple subscribers are all notified', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    subscribeTitleBarSettings(cb1)
    subscribeTitleBarSettings(cb2)
    setTitleBarVisible(false)
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('unsubscribing one does not affect others', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribeTitleBarSettings(cb1)
    subscribeTitleBarSettings(cb2)
    unsub1()
    setTitleBarAutoHide(true)
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledTimes(1)
  })
})
