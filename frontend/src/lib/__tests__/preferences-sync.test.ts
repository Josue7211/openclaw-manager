import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before any imports
vi.mock('../api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public body: unknown) {
      super(`API ${status}`)
    }
  },
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('../theme-store', () => ({
  hydrateThemeState: vi.fn(),
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
  prefSync.setPreferencesSyncAuthenticated(true)
  const apiModule = await import('../api')
  const themeStoreModule = await import('../theme-store')
  const modulesModule = await import('../modules')

  return {
    CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT: prefSync.CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT,
    initPreferencesSync: prefSync.initPreferencesSync,
    setPreferencesSyncAuthenticated: prefSync.setPreferencesSyncAuthenticated,
    apiGet: apiModule.api.get as ReturnType<typeof vi.fn>,
    apiPatch: apiModule.api.patch as ReturnType<typeof vi.fn>,
    hydrateThemeState: themeStoreModule.hydrateThemeState as ReturnType<typeof vi.fn>,
    notifyModulesChanged: modulesModule.notifyModulesChanged as ReturnType<typeof vi.fn>,
  }
}

describe('initPreferencesSync', () => {
  it('fetches remote preferences on init', async () => {
    const { initPreferencesSync, apiGet } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })

    await initPreferencesSync()

    expect(apiGet).toHaveBeenCalledWith('/api/user-preferences')
  })

  it('merges remote preferences into localStorage (remote wins)', async () => {
    localStorage.setItem('theme-state', JSON.stringify({ mode: 'dark', activeThemeId: 'default-dark', overrides: {}, customThemes: [] }))
    const { initPreferencesSync, apiGet } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'theme-state': { mode: 'light', activeThemeId: 'default-light', overrides: {}, customThemes: [] } },
    })

    await initPreferencesSync()

    const state = JSON.parse(localStorage.getItem('theme-state')!)
    expect(state.mode).toBe('light')
  })

  it('seeds remote with local prefs when remote is empty', async () => {
    localStorage.setItem('theme-state', JSON.stringify({ mode: 'dark', activeThemeId: 'default-dark', overrides: {}, customThemes: [] }))
    localStorage.setItem('dnd-enabled', JSON.stringify(true))
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })
    apiPatch.mockResolvedValue({ ok: true })

    await initPreferencesSync()

    expect(apiPatch).toHaveBeenCalledWith('/api/user-preferences', {
      preferences: expect.objectContaining({
        'dnd-enabled': true,
      }),
    })
  })

  it('does not seed remote when both local and remote are empty', async () => {
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })

    await initPreferencesSync()

    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('handles fetch failure gracefully (non-fatal)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { initPreferencesSync, apiGet } = await loadModules()
    apiGet.mockRejectedValue(new Error('network error'))

    await initPreferencesSync()

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('hydrates theme-state side effect from remote (light mode)', async () => {
    const { initPreferencesSync, apiGet, hydrateThemeState } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'theme-state': { mode: 'light', activeThemeId: 'default-light', overrides: {}, customThemes: [] } },
    })

    await initPreferencesSync()

    expect(hydrateThemeState).toHaveBeenCalledWith({ mode: 'light', activeThemeId: 'default-light', overrides: {}, customThemes: [] })
  })

  it('hydrates theme-state side effect from remote (dark mode)', async () => {
    const { initPreferencesSync, apiGet, hydrateThemeState } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'theme-state': { mode: 'dark', activeThemeId: 'default-dark', overrides: {}, customThemes: [] } },
    })

    await initPreferencesSync()

    expect(hydrateThemeState).toHaveBeenCalledWith({ mode: 'dark', activeThemeId: 'default-dark', overrides: {}, customThemes: [] })
  })

  it('syncs chat workspace preferences and notifies Chat to rehydrate projects', async () => {
    const {
      CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT,
      initPreferencesSync,
      apiGet,
    } = await loadModules()
    const eventSpy = vi.fn()
    window.addEventListener(CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT, eventSpy)
    apiGet.mockResolvedValue({
      ok: true,
      data: {
        'chat-added-projects': [{
          name: 'AgentShell',
          path: '/Users/josue/AgentShell',
          branches: ['main'],
          currentBranch: 'main',
        }],
        'chat-project-scripts': {
          '/Users/josue/AgentShell': [{ id: 'dev', name: 'Dev', command: 'npm run dev' }],
        },
        'chat-project-grouping-mode': 'repository',
      },
    })

    await initPreferencesSync()

    expect(JSON.parse(localStorage.getItem('chat-added-projects') || '[]')).toEqual([
      expect.objectContaining({ name: 'AgentShell', path: '/Users/josue/AgentShell' }),
    ])
    expect(JSON.parse(localStorage.getItem('chat-project-scripts') || '{}')).toEqual({
      '/Users/josue/AgentShell': [expect.objectContaining({ name: 'Dev', command: 'npm run dev' })],
    })
    expect(eventSpy).toHaveBeenCalledTimes(1)
    window.removeEventListener(CHAT_WORKSPACE_PREFERENCES_CHANGED_EVENT, eventSpy)
  })

  it('keeps newer local theme-state and restores it to remote', async () => {
    const localTheme = {
      mode: 'dark',
      activeThemeId: 'gruvbox-dark',
      overrides: {},
      customThemes: [],
      lastModified: 200,
    }
    localStorage.setItem('theme-state', JSON.stringify(localTheme))
    const { initPreferencesSync, apiGet, apiPatch, hydrateThemeState } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: {
        'theme-state': {
          mode: 'dark',
          activeThemeId: 'default-dark',
          overrides: {},
          customThemes: [],
          lastModified: 100,
        },
      },
    })
    apiPatch.mockResolvedValue({ ok: true })

    await initPreferencesSync()

    const state = JSON.parse(localStorage.getItem('theme-state')!)
    expect(state.activeThemeId).toBe('gruvbox-dark')
    expect(hydrateThemeState).not.toHaveBeenCalled()
    expect(apiPatch).toHaveBeenCalledWith('/api/user-preferences', {
      preferences: expect.objectContaining({
        'theme-state': localTheme,
      }),
    })
  })

  it('applies newer remote theme-state over local theme-state', async () => {
    localStorage.setItem('theme-state', JSON.stringify({
      mode: 'dark',
      activeThemeId: 'gruvbox-dark',
      overrides: {},
      customThemes: [],
      lastModified: 100,
    }))
    const { initPreferencesSync, apiGet, apiPatch, hydrateThemeState } = await loadModules()
    const remoteTheme = {
      mode: 'dark',
      activeThemeId: 'default-dark',
      overrides: {},
      customThemes: [],
      lastModified: 200,
    }
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'theme-state': remoteTheme },
    })

    await initPreferencesSync()

    const state = JSON.parse(localStorage.getItem('theme-state')!)
    expect(state.activeThemeId).toBe('default-dark')
    expect(hydrateThemeState).toHaveBeenCalledWith(remoteTheme)
    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('notifies modules store when remote includes enabled-modules', async () => {
    const { initPreferencesSync, apiGet, notifyModulesChanged } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'enabled-modules': ['chat', 'todos'] },
    })

    await initPreferencesSync()

    expect(notifyModulesChanged).toHaveBeenCalled()
  })

  it('only initializes once per module load (idempotent)', async () => {
    const { initPreferencesSync, apiGet } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })

    await initPreferencesSync()
    await initPreferencesSync()

    expect(apiGet).toHaveBeenCalledTimes(1)
  })

  it('ignores unknown remote keys (only writes synced keys)', async () => {
    const { initPreferencesSync, apiGet } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'theme-state': { mode: 'dark', activeThemeId: 'default-dark', overrides: {}, customThemes: [] }, 'unknown-key': 'should-not-appear' },
    })

    await initPreferencesSync()

    expect(localStorage.getItem('unknown-key')).toBeNull()
    const state = JSON.parse(localStorage.getItem('theme-state')!)
    expect(state.mode).toBe('dark')
  })

  it('does not apply side effects when remote is empty', async () => {
    const { initPreferencesSync, apiGet, hydrateThemeState, notifyModulesChanged } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })

    await initPreferencesSync()

    expect(hydrateThemeState).not.toHaveBeenCalled()
    expect(notifyModulesChanged).not.toHaveBeenCalled()
  })

  it('does not re-push to remote while applying remote values', async () => {
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'theme-state': { mode: 'light', activeThemeId: 'default-light', overrides: {}, customThemes: [] } },
    })

    await initPreferencesSync()

    // patch should NOT have been called — applying remote skips the push guard
    expect(apiPatch).not.toHaveBeenCalled()
  })
})

describe('collectLocal (tested via seeding behavior)', () => {
  it('collects JSON-parseable localStorage values', async () => {
    localStorage.setItem('theme-state', JSON.stringify({ mode: 'dark', activeThemeId: 'default-dark', overrides: {}, customThemes: [] }))
    localStorage.setItem('dnd-enabled', JSON.stringify(false))
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })
    apiPatch.mockResolvedValue({ ok: true })

    await initPreferencesSync()

    const call = apiPatch.mock.calls[0]
    const prefs = call[1].preferences as Record<string, unknown>
    expect((prefs['theme-state'] as { mode: string }).mode).toBe('dark')
    expect(prefs['dnd-enabled']).toBe(false)
  })

  it('collects raw string values for non-JSON localStorage entries', async () => {
    localStorage.setItem('dnd-enabled', 'not-valid-json{')
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })
    apiPatch.mockResolvedValue({ ok: true })

    await initPreferencesSync()

    const call = apiPatch.mock.calls[0]
    const prefs = call[1].preferences as Record<string, unknown>
    expect(prefs['dnd-enabled']).toBe('not-valid-json{')
  })
})
