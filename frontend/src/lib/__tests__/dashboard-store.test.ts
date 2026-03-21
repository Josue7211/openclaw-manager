import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must re-import after each localStorage clear to reset module-level state
let getDashboardState: typeof import('../dashboard-store').getDashboardState
let subscribeDashboard: typeof import('../dashboard-store').subscribeDashboard
let setEditMode: typeof import('../dashboard-store').setEditMode
let addPage: typeof import('../dashboard-store').addPage
let removePage: typeof import('../dashboard-store').removePage
let renamePage: typeof import('../dashboard-store').renamePage
let setActivePage: typeof import('../dashboard-store').setActivePage
let removeWidget: typeof import('../dashboard-store').removeWidget
let restoreWidget: typeof import('../dashboard-store').restoreWidget
let undoDashboard: typeof import('../dashboard-store').undoDashboard
let redoDashboard: typeof import('../dashboard-store').redoDashboard
let updatePageLayouts: typeof import('../dashboard-store').updatePageLayouts
let setDashboardState: typeof import('../dashboard-store').setDashboardState
let addWidgetToPage: typeof import('../dashboard-store').addWidgetToPage
let clearRecycleBin: typeof import('../dashboard-store').clearRecycleBin
let setWobbleEnabled: typeof import('../dashboard-store').setWobbleEnabled
let updateWidgetConfig: typeof import('../dashboard-store').updateWidgetConfig

// Mock crypto.randomUUID
let uuidCounter = 0
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
})

beforeEach(async () => {
  localStorage.clear()
  uuidCounter = 0
  vi.resetModules()
  const mod = await import('../dashboard-store')
  getDashboardState = mod.getDashboardState
  subscribeDashboard = mod.subscribeDashboard
  setEditMode = mod.setEditMode
  addPage = mod.addPage
  removePage = mod.removePage
  renamePage = mod.renamePage
  setActivePage = mod.setActivePage
  removeWidget = mod.removeWidget
  restoreWidget = mod.restoreWidget
  undoDashboard = mod.undoDashboard
  redoDashboard = mod.redoDashboard
  updatePageLayouts = mod.updatePageLayouts
  setDashboardState = mod.setDashboardState
  addWidgetToPage = mod.addWidgetToPage
  clearRecycleBin = mod.clearRecycleBin
  setWobbleEnabled = mod.setWobbleEnabled
  updateWidgetConfig = mod.updateWidgetConfig
})

describe('getDashboardState', () => {
  it('returns initial state with one "Home" page', () => {
    const state = getDashboardState()
    expect(state.pages).toHaveLength(1)
    expect(state.pages[0].name).toBe('Home')
  })

  it('has editMode false by default', () => {
    const state = getDashboardState()
    expect(state.editMode).toBe(false)
  })

  it('has wobbleEnabled true by default', () => {
    const state = getDashboardState()
    expect(state.wobbleEnabled).toBe(true)
  })

  it('has activePageId matching the first page', () => {
    const state = getDashboardState()
    expect(state.activePageId).toBe(state.pages[0].id)
  })

  it('has empty recycleBin', () => {
    const state = getDashboardState()
    expect(state.recycleBin).toEqual([])
  })
})

describe('setEditMode', () => {
  it('updates state and notifies subscribers', () => {
    const cb = vi.fn()
    subscribeDashboard(cb)

    setEditMode(true)
    expect(getDashboardState().editMode).toBe(true)
    expect(cb).toHaveBeenCalled()
  })

  it('clears undo stack when exiting edit mode', () => {
    // Make some changes to populate the undo stack
    setEditMode(true)
    addPage('Work')
    addPage('Play')

    // Verify undo works before exiting edit mode
    expect(undoDashboard()).toBe(true)

    // Exit edit mode — should clear stacks
    setEditMode(false)

    // Undo should now return false (stack cleared)
    expect(undoDashboard()).toBe(false)
  })
})

describe('addPage', () => {
  it('creates a new page with the given name and unique ID', () => {
    const id = addPage('Work')
    const state = getDashboardState()
    expect(state.pages.length).toBe(2)
    const newPage = state.pages.find(p => p.id === id)
    expect(newPage).toBeDefined()
    expect(newPage!.name).toBe('Work')
  })

  it('returns the new page ID', () => {
    const id = addPage('Test')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

describe('removePage', () => {
  it('moves page widgets to recycle bin and removes the page', () => {
    // Add a widget to the Home page
    const state = getDashboardState()
    const homeId = state.pages[0].id
    addWidgetToPage(homeId, 'heartbeat', {
      i: 'heartbeat', x: 0, y: 0, w: 4, h: 2,
    })

    // Add a second page so we can remove Home
    const workId = addPage('Work')
    setActivePage(workId)

    removePage(homeId)
    const after = getDashboardState()
    expect(after.pages.find(p => p.id === homeId)).toBeUndefined()
    // Widget should be in recycle bin
    expect(after.recycleBin.length).toBeGreaterThan(0)
  })
})

describe('renamePage', () => {
  it('updates the page name', () => {
    const state = getDashboardState()
    const homeId = state.pages[0].id
    renamePage(homeId, 'New Name')
    expect(getDashboardState().pages[0].name).toBe('New Name')
  })
})

describe('setActivePage', () => {
  it('switches active page', () => {
    const workId = addPage('Work')
    setActivePage(workId)
    expect(getDashboardState().activePageId).toBe(workId)
  })
})

describe('removeWidget', () => {
  it('moves widget to recycleBin with previous position', () => {
    const state = getDashboardState()
    const pageId = state.pages[0].id
    addWidgetToPage(pageId, 'heartbeat', {
      i: 'heartbeat', x: 0, y: 0, w: 4, h: 2,
    })

    removeWidget(pageId, 'heartbeat')
    const after = getDashboardState()
    expect(after.recycleBin).toHaveLength(1)
    expect(after.recycleBin[0].widgetId).toBe('heartbeat')
    expect(after.recycleBin[0].pluginId).toBe('heartbeat')
    expect(after.recycleBin[0].previousPageId).toBe(pageId)
    expect(after.recycleBin[0].previousPosition).toBeDefined()
  })
})

describe('restoreWidget', () => {
  it('restores widget to original page and position', () => {
    const state = getDashboardState()
    const pageId = state.pages[0].id
    addWidgetToPage(pageId, 'heartbeat', {
      i: 'heartbeat', x: 0, y: 0, w: 4, h: 2,
    })

    removeWidget(pageId, 'heartbeat')
    expect(getDashboardState().recycleBin).toHaveLength(1)

    restoreWidget(0)
    const after = getDashboardState()
    expect(after.recycleBin).toHaveLength(0)
    // Widget should be back in the page layouts
    const page = after.pages.find(p => p.id === pageId)
    expect(page).toBeDefined()
    const hasWidget = Object.values(page!.layouts).some(items =>
      (items as Array<{ i: string }>).some(item => item.i === 'heartbeat')
    )
    expect(hasWidget).toBe(true)
  })
})

describe('undoDashboard', () => {
  it('reverses last action and returns true', () => {
    addPage('Work')
    expect(getDashboardState().pages.length).toBe(2)

    const result = undoDashboard()
    expect(result).toBe(true)
    expect(getDashboardState().pages.length).toBe(1)
  })

  it('returns false on empty stack', () => {
    expect(undoDashboard()).toBe(false)
  })

  it('undo stack maxes at 30 entries (oldest dropped)', () => {
    // Perform 35 edits (each addPage pushes to undo)
    for (let i = 0; i < 35; i++) {
      addPage(`Page ${i}`)
    }

    // Undo 30 times should succeed
    let undoCount = 0
    while (undoDashboard()) undoCount++

    // Should have been capped at 30
    expect(undoCount).toBe(30)
  })
})

describe('redoDashboard', () => {
  it('reverses an undo', () => {
    addPage('Work')
    undoDashboard()
    expect(getDashboardState().pages.length).toBe(1)

    const result = redoDashboard()
    expect(result).toBe(true)
    expect(getDashboardState().pages.length).toBe(2)
  })
})

describe('updatePageLayouts', () => {
  it('saves layout data per breakpoint', () => {
    const state = getDashboardState()
    const pageId = state.pages[0].id
    const layouts = {
      lg: [{ i: 'heartbeat', x: 0, y: 0, w: 4, h: 2 }],
    }
    updatePageLayouts(pageId, layouts)
    const after = getDashboardState()
    const page = after.pages.find(p => p.id === pageId)
    expect(page!.layouts['lg']).toEqual(layouts['lg'])
  })
})

describe('subscribeDashboard', () => {
  it('callback fires on state change', () => {
    const cb = vi.fn()
    subscribeDashboard(cb)
    setEditMode(true)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe stops notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeDashboard(cb)
    unsub()
    setEditMode(true)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('localStorage persistence', () => {
  it('state persists to localStorage key "dashboard-state"', () => {
    addPage('Persisted')
    const stored = localStorage.getItem('dashboard-state')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed.pages.length).toBe(2)
    expect(parsed.pages[1].name).toBe('Persisted')
  })

  it('loads existing state from localStorage on init', async () => {
    // Set up some state
    addPage('FromStorage')
    const stored = localStorage.getItem('dashboard-state')
    expect(stored).toBeTruthy()

    // Reset modules and reimport
    vi.resetModules()
    const mod = await import('../dashboard-store')
    const state = mod.getDashboardState()
    expect(state.pages.length).toBe(2)
    expect(state.pages[1].name).toBe('FromStorage')
  })
})

describe('setWobbleEnabled', () => {
  it('toggles wobble state', () => {
    setWobbleEnabled(false)
    expect(getDashboardState().wobbleEnabled).toBe(false)
    setWobbleEnabled(true)
    expect(getDashboardState().wobbleEnabled).toBe(true)
  })
})

describe('addWidgetToPage _pluginId', () => {
  it('stores pluginId in widgetConfigs[instanceId]._pluginId', () => {
    const state = getDashboardState()
    const pageId = state.pages[0].id
    const instanceId = 'prim-stat-card-a1b2c3d4'
    addWidgetToPage(pageId, 'prim-stat-card', {
      i: instanceId, x: 0, y: 0, w: 4, h: 2,
    })
    const after = getDashboardState()
    const page = after.pages.find(p => p.id === pageId)
    expect(page!.widgetConfigs[instanceId]).toBeDefined()
    expect(page!.widgetConfigs[instanceId]._pluginId).toBe('prim-stat-card')
  })

  it('preserves existing widgetConfigs when adding _pluginId', () => {
    const state = getDashboardState()
    const pageId = state.pages[0].id
    // Pre-set some config
    updateWidgetConfig(pageId, 'existing-widget', { title: 'Hello' })

    addWidgetToPage(pageId, 'heartbeat', {
      i: 'heartbeat', x: 0, y: 0, w: 4, h: 2,
    })
    const after = getDashboardState()
    const page = after.pages.find(p => p.id === pageId)
    // Existing config should still be there
    expect(page!.widgetConfigs['existing-widget']?.title).toBe('Hello')
    // New widget should have _pluginId
    expect(page!.widgetConfigs['heartbeat']._pluginId).toBe('heartbeat')
  })
})

describe('removeWidget _pluginId', () => {
  it('copies _pluginId from widgetConfigs to RecycleBinItem.pluginId', () => {
    const state = getDashboardState()
    const pageId = state.pages[0].id
    const instanceId = 'prim-stat-card-a1b2c3d4'
    addWidgetToPage(pageId, 'prim-stat-card', {
      i: instanceId, x: 0, y: 0, w: 4, h: 2,
    })

    removeWidget(pageId, instanceId)
    const after = getDashboardState()
    expect(after.recycleBin).toHaveLength(1)
    expect(after.recycleBin[0].widgetId).toBe(instanceId)
    expect(after.recycleBin[0].pluginId).toBe('prim-stat-card')
  })

  it('falls back to widgetId when _pluginId is not set', () => {
    const state = getDashboardState()
    const pageId = state.pages[0].id
    // Manually add a layout item without going through addWidgetToPage
    // (simulates legacy data)
    updatePageLayouts(pageId, {
      lg: [{ i: 'legacy-widget', x: 0, y: 0, w: 4, h: 2 }],
    })

    removeWidget(pageId, 'legacy-widget')
    const after = getDashboardState()
    expect(after.recycleBin).toHaveLength(1)
    expect(after.recycleBin[0].pluginId).toBe('legacy-widget')
  })
})

describe('clearRecycleBin', () => {
  it('empties the recycle bin', () => {
    const state = getDashboardState()
    const pageId = state.pages[0].id
    addWidgetToPage(pageId, 'heartbeat', {
      i: 'heartbeat', x: 0, y: 0, w: 4, h: 2,
    })
    removeWidget(pageId, 'heartbeat')
    expect(getDashboardState().recycleBin.length).toBe(1)

    clearRecycleBin()
    expect(getDashboardState().recycleBin.length).toBe(0)
  })
})
