import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage before importing the module
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  clear: vi.fn(() => { for (const key in store) delete store[key] }),
  get length() { return Object.keys(store).length },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
}

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

describe('theme-store', () => {
  beforeEach(() => {
    // Clear localStorage mock
    for (const key in store) delete store[key]
    vi.clearAllMocks()
    // Reset module state by re-importing
    vi.resetModules()
  })

  it('getThemeState returns default state when localStorage is empty', async () => {
    const { getThemeState } = await import('../theme-store')
    const state = getThemeState()
    expect(state.mode).toBe('dark')
    expect(state.activeThemeId).toBe('default-dark')
    expect(state.overrides).toEqual({})
    expect(state.customThemes).toEqual([])
  })

  it('setActiveTheme updates activeThemeId and persists to localStorage', async () => {
    const { getThemeState, setActiveTheme } = await import('../theme-store')
    setActiveTheme('dracula')
    expect(getThemeState().activeThemeId).toBe('dracula')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'theme-state',
      expect.stringContaining('"activeThemeId":"dracula"')
    )
  })

  it('setMode updates mode to light and persists', async () => {
    const { getThemeState, setMode } = await import('../theme-store')
    setMode('light')
    expect(getThemeState().mode).toBe('light')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'theme-state',
      expect.stringContaining('"mode":"light"')
    )
  })

  it('setMode updates mode to system and persists', async () => {
    const { getThemeState, setMode } = await import('../theme-store')
    setMode('system')
    expect(getThemeState().mode).toBe('system')
  })

  it('setAccentOverride stores override for current active theme', async () => {
    const { getThemeState, setAccentOverride } = await import('../theme-store')
    setAccentOverride('#ff0000')
    const state = getThemeState()
    expect(state.overrides['default-dark']).toBeDefined()
    expect(state.overrides['default-dark'].accent).toBe('#ff0000')
  })

  it('subscribeTheme callback fires after setActiveTheme', async () => {
    const { subscribeTheme, setActiveTheme } = await import('../theme-store')
    const listener = vi.fn()
    subscribeTheme(listener)
    setActiveTheme('nord')
    expect(listener).toHaveBeenCalled()
  })

  it('subscribeTheme unsubscribe removes the callback', async () => {
    const { subscribeTheme, setActiveTheme } = await import('../theme-store')
    const listener = vi.fn()
    const unsub = subscribeTheme(listener)
    unsub()
    setActiveTheme('nord')
    expect(listener).not.toHaveBeenCalled()
  })

  it('lastModified timestamp updates on every state mutation', async () => {
    const { getThemeState, setMode } = await import('../theme-store')
    const before = getThemeState().lastModified ?? 0
    // Small delay to ensure timestamp differs
    await new Promise(r => setTimeout(r, 5))
    setMode('light')
    const after = getThemeState().lastModified ?? 0
    expect(after).toBeGreaterThanOrEqual(before)
    expect(after).toBeGreaterThan(0)
  })

  it('loads persisted state from localStorage', async () => {
    const persisted = {
      mode: 'light',
      activeThemeId: 'nord',
      overrides: { nord: { themeId: 'nord', accent: '#88c0d0' } },
      customThemes: [],
    }
    store['theme-state'] = JSON.stringify(persisted)
    const { getThemeState } = await import('../theme-store')
    const state = getThemeState()
    expect(state.mode).toBe('light')
    expect(state.activeThemeId).toBe('nord')
    expect(state.overrides.nord.accent).toBe('#88c0d0')
  })
})

describe('migration v5', () => {
  beforeEach(() => {
    for (const key in store) delete store[key]
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('reads old theme key and maps to ThemeState.mode', async () => {
    store['app-version'] = '4'
    store['theme'] = JSON.stringify('light')
    const { runMigrations } = await import('../migrations')
    runMigrations()
    const raw = store['theme-state']
    expect(raw).toBeDefined()
    const state = JSON.parse(raw)
    expect(state.mode).toBe('light')
    expect(state.activeThemeId).toBe('default-light')
  })

  it('reads old accent-color key and stores as override', async () => {
    store['app-version'] = '4'
    store['theme'] = JSON.stringify('dark')
    store['accent-color'] = JSON.stringify('#ff0000')
    const { runMigrations } = await import('../migrations')
    runMigrations()
    const state = JSON.parse(store['theme-state'])
    expect(state.overrides['default-dark'].accent).toBe('#ff0000')
  })

  it('reads old glow-color, secondary-color, logo-color keys into overrides', async () => {
    store['app-version'] = '4'
    store['theme'] = JSON.stringify('dark')
    store['glow-color'] = JSON.stringify('#00ff00')
    store['secondary-color'] = JSON.stringify('#0000ff')
    store['logo-color'] = JSON.stringify('#ff00ff')
    const { runMigrations } = await import('../migrations')
    runMigrations()
    const state = JSON.parse(store['theme-state'])
    expect(state.overrides['default-dark'].glow).toBe('#00ff00')
    expect(state.overrides['default-dark'].secondary).toBe('#0000ff')
    expect(state.overrides['default-dark'].logo).toBe('#ff00ff')
  })

  it('does not crash when old keys are missing', async () => {
    store['app-version'] = '4'
    const { runMigrations } = await import('../migrations')
    expect(() => runMigrations()).not.toThrow()
    // Should still create a theme-state with defaults
    const raw = store['theme-state']
    expect(raw).toBeDefined()
  })

  it('removes old keys after migration', async () => {
    store['app-version'] = '4'
    store['theme'] = JSON.stringify('dark')
    store['accent-color'] = JSON.stringify('#ff0000')
    store['glow-color'] = JSON.stringify('#00ff00')
    store['secondary-color'] = JSON.stringify('#0000ff')
    store['logo-color'] = JSON.stringify('#ff00ff')
    const { runMigrations } = await import('../migrations')
    runMigrations()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('theme')
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('accent-color')
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('glow-color')
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('secondary-color')
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('logo-color')
  })

  it('skips migration if theme-state already exists', async () => {
    store['app-version'] = '4'
    store['theme'] = JSON.stringify('light')
    store['theme-state'] = JSON.stringify({
      mode: 'dark',
      activeThemeId: 'dracula',
      overrides: {},
      customThemes: [],
    })
    const { runMigrations } = await import('../migrations')
    runMigrations()
    // The existing theme-state should not be overwritten
    const state = JSON.parse(store['theme-state'])
    expect(state.activeThemeId).toBe('dracula')
  })

  it('maps system mode correctly', async () => {
    store['app-version'] = '4'
    store['theme'] = JSON.stringify('system')
    const { runMigrations } = await import('../migrations')
    runMigrations()
    const state = JSON.parse(store['theme-state'])
    expect(state.mode).toBe('system')
    // system mode defaults to dark theme
    expect(state.activeThemeId).toBe('default-dark')
  })
})
