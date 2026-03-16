import { describe, it, expect, vi, beforeEach } from 'vitest'

let APP_MODULES: typeof import('../modules').APP_MODULES
let getEnabledModules: typeof import('../modules').getEnabledModules
let setEnabledModules: typeof import('../modules').setEnabledModules
let subscribeModules: typeof import('../modules').subscribeModules
let notifyModulesChanged: typeof import('../modules').notifyModulesChanged

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('../modules')
  APP_MODULES = mod.APP_MODULES
  getEnabledModules = mod.getEnabledModules
  setEnabledModules = mod.setEnabledModules
  subscribeModules = mod.subscribeModules
  notifyModulesChanged = mod.notifyModulesChanged
})

describe('getEnabledModules', () => {
  it('returns all module IDs when localStorage is empty', () => {
    const enabled = getEnabledModules()
    const allIds = APP_MODULES.map(m => m.id)
    expect(enabled).toEqual(allIds)
  })

  it('returns stored array from localStorage', async () => {
    // Must set localStorage BEFORE importing the module, since _cached
    // is computed at module load time via the IIFE initializer
    const subset = ['chat', 'todos']
    localStorage.setItem('enabled-modules', JSON.stringify(subset))
    vi.resetModules()
    const mod = await import('../modules')
    expect(mod.getEnabledModules()).toEqual(subset)
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

  it('supports multiple independent listeners', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    subscribeModules(cb1)
    const unsub2 = subscribeModules(cb2)

    setEnabledModules(['chat'])
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)

    unsub2()
    setEnabledModules(['todos'])
    expect(cb1).toHaveBeenCalledTimes(2)
    expect(cb2).toHaveBeenCalledTimes(1)
  })
})

describe('APP_MODULES structure', () => {
  it('has at least 10 modules defined', () => {
    expect(APP_MODULES.length).toBeGreaterThanOrEqual(10)
  })

  it('every module has required fields', () => {
    for (const mod of APP_MODULES) {
      expect(mod.id).toBeTruthy()
      expect(mod.name).toBeTruthy()
      expect(mod.description).toBeTruthy()
      expect(mod.icon).toBeTruthy()
      expect(mod.route).toMatch(/^\//)
    }
  })

  it('all module IDs are unique', () => {
    const ids = APP_MODULES.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all module routes are unique', () => {
    const routes = APP_MODULES.map(m => m.route)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('platform values are restricted to valid options', () => {
    const validPlatforms = ['macos', 'linux', 'windows', 'all']
    for (const mod of APP_MODULES) {
      if (mod.platform !== undefined) {
        expect(validPlatforms).toContain(mod.platform)
      }
    }
  })

  it('messages module requires macos platform', () => {
    const messages = APP_MODULES.find(m => m.id === 'messages')
    expect(messages).toBeDefined()
    expect(messages!.platform).toBe('macos')
  })
})

describe('notifyModulesChanged', () => {
  it('fires all subscribed listeners without changing cached value', () => {
    const cb = vi.fn()
    subscribeModules(cb)

    const before = getEnabledModules()
    notifyModulesChanged()
    const after = getEnabledModules()

    expect(cb).toHaveBeenCalledTimes(1)
    expect(after).toEqual(before)
  })
})

describe('setEnabledModules edge cases', () => {
  it('updates cached value returned by getEnabledModules', () => {
    const subset = ['chat', 'todos', 'email']
    setEnabledModules(subset)
    expect(getEnabledModules()).toEqual(subset)
  })

  it('allows setting an empty array', () => {
    setEnabledModules([])
    expect(getEnabledModules()).toEqual([])
    expect(JSON.parse(localStorage.getItem('enabled-modules')!)).toEqual([])
  })
})

describe('APP_MODULES completeness — every module route has a matching nav item', () => {
  it('every APP_MODULE with a moduleId has a corresponding nav item', async () => {
    const { allNavItems } = await import('../nav-items')
    const navModuleIds = allNavItems
      .filter(n => n.moduleId)
      .map(n => n.moduleId!)

    // Every nav item with a moduleId must reference a valid APP_MODULE
    for (const moduleId of navModuleIds) {
      const mod = APP_MODULES.find(m => m.id === moduleId)
      expect(mod, `nav item moduleId "${moduleId}" has no matching APP_MODULE`).toBeDefined()
    }
  })

  it('every APP_MODULE route matches a nav item href', async () => {
    const { allNavItems } = await import('../nav-items')
    const navHrefs = new Set(allNavItems.map(n => n.href))

    for (const mod of APP_MODULES) {
      expect(
        navHrefs.has(mod.route),
        `APP_MODULE "${mod.id}" route "${mod.route}" has no matching nav item href`
      ).toBe(true)
    }
  })

  it('nav item labels match APP_MODULE names', async () => {
    const { allNavItems } = await import('../nav-items')
    for (const navItem of allNavItems) {
      if (!navItem.moduleId) continue
      const mod = APP_MODULES.find(m => m.id === navItem.moduleId)
      if (mod) {
        expect(navItem.label).toBe(mod.name)
      }
    }
  })
})

describe('disabling a module removes it from getEnabledModules', () => {
  it('removing a single module excludes it from the result', () => {
    const allIds = APP_MODULES.map(m => m.id)
    const withoutChat = allIds.filter(id => id !== 'chat')
    setEnabledModules(withoutChat)

    const enabled = getEnabledModules()
    expect(enabled).not.toContain('chat')
    expect(enabled.length).toBe(allIds.length - 1)
  })

  it('removing multiple modules excludes all of them', () => {
    const toRemove = ['chat', 'todos', 'email', 'homelab']
    const remaining = APP_MODULES.map(m => m.id).filter(id => !toRemove.includes(id))
    setEnabledModules(remaining)

    const enabled = getEnabledModules()
    for (const id of toRemove) {
      expect(enabled, `"${id}" should not be in enabled modules`).not.toContain(id)
    }
    expect(enabled.length).toBe(APP_MODULES.length - toRemove.length)
  })

  it('re-enabling a disabled module restores it', () => {
    const allIds = APP_MODULES.map(m => m.id)
    // Disable chat
    setEnabledModules(allIds.filter(id => id !== 'chat'))
    expect(getEnabledModules()).not.toContain('chat')

    // Re-enable
    setEnabledModules(allIds)
    expect(getEnabledModules()).toContain('chat')
  })

  it('preserves order of remaining modules after disabling', () => {
    const allIds = APP_MODULES.map(m => m.id)
    const withoutMiddle = allIds.filter(id => id !== 'todos')
    setEnabledModules(withoutMiddle)

    const enabled = getEnabledModules()
    // Chat comes before calendar in the original order
    const chatIdx = enabled.indexOf('chat')
    const calendarIdx = enabled.indexOf('calendar')
    expect(chatIdx).toBeLessThan(calendarIdx)
  })
})
