import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before any imports
vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('../themes', () => ({
  applyAccentColor: vi.fn(),
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
  const themesModule = await import('../themes')
  const modulesModule = await import('../modules')

  return {
    initPreferencesSync: prefSync.initPreferencesSync,
    apiGet: apiModule.api.get as ReturnType<typeof vi.fn>,
    apiPatch: apiModule.api.patch as ReturnType<typeof vi.fn>,
    applyAccentColor: themesModule.applyAccentColor as ReturnType<typeof vi.fn>,
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
    localStorage.setItem('theme', JSON.stringify('dark'))
    const { initPreferencesSync, apiGet } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { theme: 'light', 'accent-color': '#ff0000' },
    })

    await initPreferencesSync()

    expect(JSON.parse(localStorage.getItem('theme')!)).toBe('light')
    expect(JSON.parse(localStorage.getItem('accent-color')!)).toBe('#ff0000')
  })

  it('seeds remote with local prefs when remote is empty', async () => {
    localStorage.setItem('theme', JSON.stringify('dark'))
    localStorage.setItem('dnd-enabled', JSON.stringify(true))
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })
    apiPatch.mockResolvedValue({ ok: true })

    await initPreferencesSync()

    expect(apiPatch).toHaveBeenCalledWith('/api/user-preferences', {
      preferences: expect.objectContaining({
        theme: 'dark',
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

  it('applies theme=light side effect from remote', async () => {
    const { initPreferencesSync, apiGet } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { theme: 'light' },
    })

    await initPreferencesSync()

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('applies theme=dark side effect from remote', async () => {
    const { initPreferencesSync, apiGet } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { theme: 'dark' },
    })

    await initPreferencesSync()

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applies accent-color side effect from remote', async () => {
    const { initPreferencesSync, apiGet, applyAccentColor } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { 'accent-color': '#34d399' },
    })

    await initPreferencesSync()

    expect(applyAccentColor).toHaveBeenCalledWith('#34d399')
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
      data: { theme: 'dark', 'unknown-key': 'should-not-appear' },
    })

    await initPreferencesSync()

    expect(localStorage.getItem('unknown-key')).toBeNull()
    expect(JSON.parse(localStorage.getItem('theme')!)).toBe('dark')
  })

  it('does not apply side effects when remote is empty', async () => {
    const { initPreferencesSync, apiGet, applyAccentColor, notifyModulesChanged } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })

    await initPreferencesSync()

    expect(applyAccentColor).not.toHaveBeenCalled()
    expect(notifyModulesChanged).not.toHaveBeenCalled()
  })

  it('does not re-push to remote while applying remote values', async () => {
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({
      ok: true,
      data: { theme: 'light' },
    })

    await initPreferencesSync()

    // patch should NOT have been called — applying remote skips the push guard
    expect(apiPatch).not.toHaveBeenCalled()
  })
})

describe('collectLocal (tested via seeding behavior)', () => {
  it('collects JSON-parseable localStorage values', async () => {
    localStorage.setItem('theme', JSON.stringify('dark'))
    localStorage.setItem('dnd-enabled', JSON.stringify(false))
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })
    apiPatch.mockResolvedValue({ ok: true })

    await initPreferencesSync()

    const call = apiPatch.mock.calls[0]
    const prefs = call[1].preferences as Record<string, unknown>
    expect(prefs.theme).toBe('dark')
    expect(prefs['dnd-enabled']).toBe(false)
  })

  it('collects raw string values for non-JSON localStorage entries', async () => {
    localStorage.setItem('theme', 'not-valid-json{')
    const { initPreferencesSync, apiGet, apiPatch } = await loadModules()
    apiGet.mockResolvedValue({ ok: true, data: {} })
    apiPatch.mockResolvedValue({ ok: true })

    await initPreferencesSync()

    const call = apiPatch.mock.calls[0]
    const prefs = call[1].preferences as Record<string, unknown>
    expect(prefs.theme).toBe('not-valid-json{')
  })
})
