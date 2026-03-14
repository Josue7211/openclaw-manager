import { describe, it, expect, vi, beforeEach } from 'vitest'

let APP_MODULES: typeof import('../modules').APP_MODULES
let getEnabledModules: typeof import('../modules').getEnabledModules
let setEnabledModules: typeof import('../modules').setEnabledModules
let subscribeModules: typeof import('../modules').subscribeModules

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('../modules')
  APP_MODULES = mod.APP_MODULES
  getEnabledModules = mod.getEnabledModules
  setEnabledModules = mod.setEnabledModules
  subscribeModules = mod.subscribeModules
})

describe('getEnabledModules', () => {
  it('returns all module IDs when localStorage is empty', () => {
    const enabled = getEnabledModules()
    const allIds = APP_MODULES.map(m => m.id)
    expect(enabled).toEqual(allIds)
  })

  it('returns stored array from localStorage', () => {
    const subset = ['chat', 'todos']
    localStorage.setItem('enabled-modules', JSON.stringify(subset))
    expect(getEnabledModules()).toEqual(subset)
  })

  it('falls back to all modules on invalid JSON', () => {
    localStorage.setItem('enabled-modules', 'not-json')
    const enabled = getEnabledModules()
    expect(enabled).toEqual(APP_MODULES.map(m => m.id))
  })

  it('falls back to all modules when stored value is not an array', () => {
    localStorage.setItem('enabled-modules', JSON.stringify({ chat: true }))
    const enabled = getEnabledModules()
    expect(enabled).toEqual(APP_MODULES.map(m => m.id))
  })
})

describe('setEnabledModules', () => {
  it('persists module IDs to localStorage', () => {
    const subset = ['chat', 'email']
    setEnabledModules(subset)
    expect(JSON.parse(localStorage.getItem('enabled-modules')!)).toEqual(subset)
  })

  it('notifies listeners on change', () => {
    const cb = vi.fn()
    const unsub = subscribeModules(cb)

    setEnabledModules(['chat'])
    expect(cb).toHaveBeenCalledTimes(1)

    unsub()
  })
})

describe('subscribeModules', () => {
  it('fires callback when modules change', () => {
    const cb = vi.fn()
    const unsub = subscribeModules(cb)

    setEnabledModules(['chat'])
    expect(cb).toHaveBeenCalledTimes(1)

    unsub()
  })

  it('returns an unsubscribe function that stops notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeModules(cb)
    unsub()

    setEnabledModules(['todos'])
    expect(cb).not.toHaveBeenCalled()
  })
})
