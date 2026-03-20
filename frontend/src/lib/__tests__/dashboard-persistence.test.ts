import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before any imports
vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('../theme-store', () => ({
  applyThemeFromState: vi.fn(),
}))

vi.mock('../modules', () => ({
  notifyModulesChanged: vi.fn(),
}))

// initPreferencesSync monkey-patches localStorage.setItem. The JSDOM localStorage
// instance persists across vi.resetModules() calls, so we must restore the original
// setItem between tests.
const _nativeSetItem = localStorage.setItem.bind(localStorage)

beforeEach(() => {
  localStorage.setItem = _nativeSetItem
  localStorage.clear()
  vi.resetModules()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function loadModules() {
  const prefSync = await import('../preferences-sync')
  const apiModule = await import('../api')

  return {
    initPreferencesSync: prefSync.initPreferencesSync,
    SYNCED_KEYS: prefSync.SYNCED_KEYS,
    apiGet: apiModule.api.get as ReturnType<typeof vi.fn>,
    apiPatch: apiModule.api.patch as ReturnType<typeof vi.fn>,
  }
}

// ---------------------------------------------------------------------------
// 1. SYNCED_KEYS includes 'dashboard-state'
// ---------------------------------------------------------------------------

describe('SYNCED_KEYS includes dashboard-state', () => {
  it('has dashboard-state in the SYNCED_KEYS array', async () => {
    const { SYNCED_KEYS } = await loadModules()
    expect(SYNCED_KEYS).toBeDefined()
    expect(SYNCED_KEYS).toContain('dashboard-state')
  })

  it('dashboard-state is recognized as a synced key for interceptor', async () => {
    const { SYNCED_KEYS } = await loadModules()
    // Verify it's in the array alongside other known synced keys
    expect(SYNCED_KEYS).toContain('theme-state')
    expect(SYNCED_KEYS).toContain('sidebar-config')
    expect(SYNCED_KEYS).toContain('dashboard-state')
  })
})

// ---------------------------------------------------------------------------
// 2. Dashboard-state sync via preferences-sync
// ---------------------------------------------------------------------------

describe('dashboard-state sync via preferences-sync', () => {
  it('includes dashboard-state in local collection for Supabase push (seeding)', async () => {
    // When dashboard-state exists in localStorage and remote is empty,
    // initPreferencesSync seeds remote with all local prefs including dashboard-state
    const state = {
      pages: [{ id: 'p1', name: 'Home', sortOrder: 0, layouts: {}, widgetConfigs: {} }],
      activePageId: 'p1',
      editMode: false,
      wobbleEnabled: true,
      dotIndicatorsEnabled: false,
      recycleBin: [],
      lastModified: '2026-03-20T00:00:00.000Z',
    }
    localStorage.setItem('dashboard-state', JSON.stringify(state))

    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })
    apiPatch.mockResolvedValue({ ok: true })

    await initPreferencesSync()

    // Since remote is empty and local has data, initPreferencesSync seeds remote
    expect(apiPatch).toHaveBeenCalledWith('/api/user-preferences', {
      preferences: expect.objectContaining({
        'dashboard-state': state,
      }),
    })
  })

  it('applies remote dashboard-state when remote is newer (last-write-wins)', async () => {
    // Local state has older timestamp
    const localState = {
      pages: [{ id: 'p1', name: 'Local', sortOrder: 0, layouts: {}, widgetConfigs: {} }],
      activePageId: 'p1',
      editMode: false,
      wobbleEnabled: true,
      dotIndicatorsEnabled: false,
      recycleBin: [],
      lastModified: '2026-03-19T00:00:00.000Z',
    }
    localStorage.setItem('dashboard-state', JSON.stringify(localState))

    const { initPreferencesSync, apiGet } = await loadModules()
    const remoteState = {
      pages: [{ id: 'p1', name: 'Remote', sortOrder: 0, layouts: {}, widgetConfigs: {} }],
      activePageId: 'p1',
      editMode: false,
      wobbleEnabled: true,
      dotIndicatorsEnabled: false,
      recycleBin: [],
      lastModified: '2026-03-20T12:00:00.000Z',
    }
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'dashboard-state': remoteState },
    })

    await initPreferencesSync()

    const stored = JSON.parse(localStorage.getItem('dashboard-state')!)
    expect(stored.pages[0].name).toBe('Remote')
    expect(stored.lastModified).toBe('2026-03-20T12:00:00.000Z')
  })

  it('keeps local dashboard-state when local is newer than remote (last-write-wins)', async () => {
    // Local state has newer timestamp
    const localState = {
      pages: [{ id: 'p1', name: 'Local', sortOrder: 0, layouts: {}, widgetConfigs: {} }],
      activePageId: 'p1',
      editMode: false,
      wobbleEnabled: true,
      dotIndicatorsEnabled: false,
      recycleBin: [],
      lastModified: '2026-03-20T23:59:59.000Z',
    }
    localStorage.setItem('dashboard-state', JSON.stringify(localState))

    const { initPreferencesSync, apiGet } = await loadModules()
    const remoteState = {
      pages: [{ id: 'p1', name: 'Remote', sortOrder: 0, layouts: {}, widgetConfigs: {} }],
      activePageId: 'p1',
      editMode: false,
      wobbleEnabled: true,
      dotIndicatorsEnabled: false,
      recycleBin: [],
      lastModified: '2026-03-18T00:00:00.000Z',
    }
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'dashboard-state': remoteState },
    })

    await initPreferencesSync()

    const stored = JSON.parse(localStorage.getItem('dashboard-state')!)
    expect(stored.pages[0].name).toBe('Local')
    expect(stored.lastModified).toBe('2026-03-20T23:59:59.000Z')
  })

  it('applies remote dashboard-state when no local state exists', async () => {
    // No local dashboard-state at all
    const { initPreferencesSync, apiGet } = await loadModules()
    const remoteState = {
      pages: [{ id: 'p1', name: 'Remote', sortOrder: 0, layouts: {}, widgetConfigs: {} }],
      activePageId: 'p1',
      editMode: false,
      wobbleEnabled: true,
      dotIndicatorsEnabled: false,
      recycleBin: [],
      lastModified: '2026-03-20T12:00:00.000Z',
    }
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'dashboard-state': remoteState },
    })

    await initPreferencesSync()

    const stored = JSON.parse(localStorage.getItem('dashboard-state')!)
    expect(stored.pages[0].name).toBe('Remote')
  })

  it('other synced keys still use remote-wins (not last-write-wins)', async () => {
    // theme-state should always be overwritten by remote
    const localTheme = { mode: 'dark', activeThemeId: 'local-dark', overrides: {}, customThemes: [] }
    localStorage.setItem('theme-state', JSON.stringify(localTheme))

    const { initPreferencesSync, apiGet } = await loadModules()
    const remoteTheme = { mode: 'light', activeThemeId: 'remote-light', overrides: {}, customThemes: [] }
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'theme-state': remoteTheme },
    })

    await initPreferencesSync()

    const stored = JSON.parse(localStorage.getItem('theme-state')!)
    // theme-state uses remote-wins, so remote always overwrites
    expect(stored.mode).toBe('light')
    expect(stored.activeThemeId).toBe('remote-light')
  })
})

// ---------------------------------------------------------------------------
// 3. Keybinding for dashboard-edit
// ---------------------------------------------------------------------------

describe('keybindings DEFAULTS includes dashboard-edit', () => {
  it('has a dashboard-edit keybinding entry', async () => {
    const kb = await import('../keybindings')
    const bindings = kb.getKeybindings()
    const dashEdit = bindings.find(b => b.id === 'dashboard-edit')
    expect(dashEdit).toBeDefined()
    expect(dashEdit!.key).toBe('e')
    expect(dashEdit!.mod).toBe(true)
    expect(dashEdit!.action).toBe('dashboard-edit')
    expect(dashEdit!.label).toBe('Edit dashboard')
  })

  it('dashboard-edit does not conflict with nav-email (different action types)', async () => {
    const kb = await import('../keybindings')
    const bindings = kb.getKeybindings()
    const dashEdit = bindings.find(b => b.id === 'dashboard-edit')
    const navEmail = bindings.find(b => b.id === 'nav-email')

    expect(dashEdit).toBeDefined()
    expect(navEmail).toBeDefined()
    // dashboard-edit is an action, nav-email is a route -- distinct types
    expect(dashEdit!.action).toBe('dashboard-edit')
    expect(dashEdit!.route).toBeUndefined()
    expect(navEmail!.route).toBe('/email')
    expect(navEmail!.action).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 4. JSON serialization roundtrip
// ---------------------------------------------------------------------------

describe('dashboard state JSON roundtrip', () => {
  it('roundtrips a realistic DashboardState without data loss', () => {
    const state = {
      pages: [
        {
          id: 'page-1',
          name: 'Home',
          sortOrder: 0,
          layouts: {
            lg: [
              { i: 'widget-1', x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
              { i: 'widget-2', x: 4, y: 0, w: 8, h: 4, static: true },
            ],
            md: [
              { i: 'widget-1', x: 0, y: 0, w: 4, h: 3 },
              { i: 'widget-2', x: 0, y: 3, w: 8, h: 4 },
            ],
          },
          widgetConfigs: {
            'widget-1': { pollInterval: 10000, showHeader: true },
            'widget-2': { theme: 'dark', collapsed: false },
          },
        },
      ],
      activePageId: 'page-1',
      editMode: false,
      wobbleEnabled: true,
      dotIndicatorsEnabled: false,
      recycleBin: [
        {
          widgetId: 'removed-1',
          pluginId: 'clock',
          removedAt: '2026-03-19T10:00:00.000Z',
          previousPosition: { i: 'removed-1', x: 0, y: 0, w: 2, h: 2 },
          previousPageId: 'page-1',
        },
      ],
      lastModified: '2026-03-20T12:00:00.000Z',
    }

    const serialized = JSON.stringify(state)
    const deserialized = JSON.parse(serialized)

    expect(deserialized).toEqual(state)
    expect(deserialized.pages).toHaveLength(1)
    expect(deserialized.pages[0].layouts.lg).toHaveLength(2)
    expect(deserialized.pages[0].widgetConfigs['widget-1'].pollInterval).toBe(10000)
    expect(deserialized.recycleBin).toHaveLength(1)
    expect(deserialized.recycleBin[0].previousPosition.w).toBe(2)
  })

  it('handles large dashboard state (10 pages, 50 widgets)', () => {
    const pages = Array.from({ length: 10 }, (_, pageIdx) => ({
      id: `page-${pageIdx}`,
      name: `Page ${pageIdx}`,
      sortOrder: pageIdx,
      layouts: {
        lg: Array.from({ length: 5 }, (_, widgetIdx) => ({
          i: `widget-${pageIdx}-${widgetIdx}`,
          x: (widgetIdx * 4) % 12,
          y: Math.floor(widgetIdx / 3) * 2,
          w: 4,
          h: 2,
          minW: 2,
          minH: 1,
        })),
      },
      widgetConfigs: Object.fromEntries(
        Array.from({ length: 5 }, (_, widgetIdx) => [
          `widget-${pageIdx}-${widgetIdx}`,
          { config: `value-${pageIdx}-${widgetIdx}`, nested: { deep: true } },
        ])
      ),
    }))

    const state = {
      pages,
      activePageId: 'page-0',
      editMode: false,
      wobbleEnabled: true,
      dotIndicatorsEnabled: false,
      recycleBin: [],
      lastModified: '2026-03-20T00:00:00.000Z',
    }

    const serialized = JSON.stringify(state)
    const deserialized = JSON.parse(serialized)

    expect(deserialized).toEqual(state)
    expect(deserialized.pages).toHaveLength(10)

    // Count total widgets across all pages
    const totalWidgets = deserialized.pages.reduce(
      (sum: number, p: { layouts: { lg: unknown[] } }) => sum + p.layouts.lg.length,
      0
    )
    expect(totalWidgets).toBe(50)

    // Verify serialized size is reasonable (< 50KB for 50 widgets)
    expect(serialized.length).toBeLessThan(50000)
  })
})
