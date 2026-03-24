import { describe, it, expect, vi, beforeEach } from 'vitest'

let runMigrations: typeof import('../migrations').runMigrations

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('../migrations')
  runMigrations = mod.runMigrations
})

describe('runMigrations', () => {
  it('sets app-version to current version when no stored version exists', () => {
    runMigrations()
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  it('skips all migration bodies when version is already current', () => {
    localStorage.setItem('app-version', '7')
    localStorage.setItem('dnd-enabled', 'true')
    localStorage.setItem('enabled-modules', JSON.stringify(['chat']))

    const spy = vi.spyOn(Storage.prototype, 'setItem')
    runMigrations()

    const calls = spy.mock.calls.filter(([key]) => key !== 'app-version')
    expect(calls).toHaveLength(0)

    spy.mockRestore()
  })

  it('preserves boolean string values during v0 -> v1 migration', () => {
    localStorage.setItem('dnd-enabled', 'true')
    localStorage.setItem('system-notifs', 'false')
    localStorage.setItem('sidebar-header-visible', 'true')

    runMigrations()

    expect(localStorage.getItem('dnd-enabled')).toBe('true')
    expect(localStorage.getItem('system-notifs')).toBe('false')
    expect(localStorage.getItem('sidebar-header-visible')).toBe('true')
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  it('does not touch keys that have non-boolean values', () => {
    localStorage.setItem('dnd-enabled', 'custom-value')
    runMigrations()
    expect(localStorage.getItem('dnd-enabled')).toBe('custom-value')
  })

  it('handles keys that do not exist in localStorage', () => {
    localStorage.setItem('in-app-notifs', 'true')
    runMigrations()
    expect(localStorage.getItem('in-app-notifs')).toBe('true')
    expect(localStorage.getItem('dnd-enabled')).toBeNull()
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  // v1 -> v2 migration tests
  it('appends new modules to existing enabled-modules list', () => {
    localStorage.setItem('app-version', '1')
    const oldModules = [
      'messages', 'chat', 'todos', 'calendar', 'reminders', 'email',
      'pomodoro', 'homelab', 'media', 'dashboard', 'missions', 'agents',
      'memory', 'crons', 'pipeline', 'knowledge',
    ]
    localStorage.setItem('enabled-modules', JSON.stringify(oldModules))

    runMigrations()

    const updated = JSON.parse(localStorage.getItem('enabled-modules')!)
    expect(updated).toContain('notes')
    expect(updated).toContain('status')
    expect(updated.slice(0, oldModules.length)).toEqual(oldModules)
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  it('does not duplicate modules that are already in the list', () => {
    localStorage.setItem('app-version', '1')
    const existing = ['chat', 'notes', 'status']
    localStorage.setItem('enabled-modules', JSON.stringify(existing))

    runMigrations()

    const updated = JSON.parse(localStorage.getItem('enabled-modules')!)
    expect(updated.filter((id: string) => id === 'notes')).toHaveLength(1)
    expect(updated.filter((id: string) => id === 'status')).toHaveLength(1)
    expect(updated).toContain('messages')
    expect(updated).toContain('todos')
  })

  it('does not touch enabled-modules when none are stored', () => {
    localStorage.setItem('app-version', '1')
    runMigrations()
    expect(localStorage.getItem('enabled-modules')).toBeNull()
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  it('handles invalid JSON in enabled-modules gracefully', () => {
    localStorage.setItem('app-version', '1')
    localStorage.setItem('enabled-modules', 'not-valid-json')
    runMigrations()
    expect(localStorage.getItem('enabled-modules')).toBe('not-valid-json')
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  it('runs both v0->v1 and v1->v2 migrations from fresh install', () => {
    localStorage.setItem('dnd-enabled', 'true')
    const oldModules = ['chat', 'todos']
    localStorage.setItem('enabled-modules', JSON.stringify(oldModules))

    runMigrations()

    expect(localStorage.getItem('dnd-enabled')).toBe('true')
    const updated = JSON.parse(localStorage.getItem('enabled-modules')!)
    expect(updated).toContain('notes')
    expect(updated).toContain('status')
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  // v2 -> v3 migration tests
  it('removes mc-notes-vault and notes-data from localStorage', () => {
    localStorage.setItem('app-version', '2')
    localStorage.setItem('mc-notes-vault', JSON.stringify([{ _id: 'test', content: 'secret note body' }]))
    localStorage.setItem('notes-data', JSON.stringify([{ id: '1', content: 'legacy note' }]))

    runMigrations()

    expect(localStorage.getItem('mc-notes-vault')).toBeNull()
    expect(localStorage.getItem('notes-data')).toBeNull()
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  it('does not error when mc-notes-vault and notes-data are absent', () => {
    localStorage.setItem('app-version', '2')
    runMigrations()
    expect(localStorage.getItem('mc-notes-vault')).toBeNull()
    expect(localStorage.getItem('notes-data')).toBeNull()
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  // v3 -> v4 migration tests
  it('sets toast-position to top-left for existing users without the key', () => {
    localStorage.setItem('app-version', '3')
    runMigrations()
    expect(localStorage.getItem('toast-position')).toBe('top-left')
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  it('does not overwrite existing toast-position preference', () => {
    localStorage.setItem('app-version', '3')
    localStorage.setItem('toast-position', 'bottom-right')
    runMigrations()
    expect(localStorage.getItem('toast-position')).toBe('bottom-right')
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  // v5 -> v6 migration tests (secondary -> tertiary rename)
  it('renames overrides secondary (blue) to tertiary', () => {
    localStorage.setItem('app-version', '5')
    const themeState = {
      mode: 'dark',
      activeThemeId: 'default-dark',
      overrides: {
        'default-dark': { themeId: 'default-dark', secondary: '#818cf8', accent: '#a78bfa' },
      },
      customThemes: [],
    }
    localStorage.setItem('theme-state', JSON.stringify(themeState))

    runMigrations()

    const updated = JSON.parse(localStorage.getItem('theme-state')!)
    expect(updated.overrides['default-dark'].tertiary).toBe('#818cf8')
    expect(updated.overrides['default-dark'].secondary).toBeUndefined()
    expect(updated.overrides['default-dark'].accent).toBe('#a78bfa')
    expect(localStorage.getItem('app-version')).toBe('8')
  })

  it('migration v6 handles multiple override entries', () => {
    localStorage.setItem('app-version', '5')
    const themeState = {
      mode: 'dark',
      activeThemeId: 'default-dark',
      overrides: {
        'default-dark': { themeId: 'default-dark', secondary: '#818cf8' },
        'dracula': { themeId: 'dracula', secondary: '#bd93f9' },
      },
      customThemes: [],
    }
    localStorage.setItem('theme-state', JSON.stringify(themeState))

    runMigrations()

    const updated = JSON.parse(localStorage.getItem('theme-state')!)
    expect(updated.overrides['default-dark'].tertiary).toBe('#818cf8')
    expect(updated.overrides['default-dark'].secondary).toBeUndefined()
    expect(updated.overrides['dracula'].tertiary).toBe('#bd93f9')
    expect(updated.overrides['dracula'].secondary).toBeUndefined()
  })

  it('migration v6 is idempotent (running twice does not break)', () => {
    localStorage.setItem('app-version', '5')
    const themeState = {
      mode: 'dark',
      activeThemeId: 'default-dark',
      overrides: {
        'default-dark': { themeId: 'default-dark', secondary: '#818cf8' },
      },
      customThemes: [],
    }
    localStorage.setItem('theme-state', JSON.stringify(themeState))

    runMigrations()

    const first = JSON.parse(localStorage.getItem('theme-state')!)
    expect(first.overrides['default-dark'].tertiary).toBe('#818cf8')

    // Run again (version is now 6, so migration block should be skipped)
    runMigrations()

    const second = JSON.parse(localStorage.getItem('theme-state')!)
    expect(second.overrides['default-dark'].tertiary).toBe('#818cf8')
    expect(second.overrides['default-dark'].secondary).toBeUndefined()
  })

  it('migration v6 leaves overrides without secondary unchanged', () => {
    localStorage.setItem('app-version', '5')
    const themeState = {
      mode: 'dark',
      activeThemeId: 'default-dark',
      overrides: {
        'default-dark': { themeId: 'default-dark', accent: '#ff0000' },
      },
      customThemes: [],
    }
    localStorage.setItem('theme-state', JSON.stringify(themeState))

    runMigrations()

    const updated = JSON.parse(localStorage.getItem('theme-state')!)
    expect(updated.overrides['default-dark'].accent).toBe('#ff0000')
    expect(updated.overrides['default-dark'].tertiary).toBeUndefined()
    expect(updated.overrides['default-dark'].secondary).toBeUndefined()
  })

  it('migration v6 handles missing theme-state gracefully', () => {
    localStorage.setItem('app-version', '5')
    // No theme-state key at all

    runMigrations()

    expect(localStorage.getItem('app-version')).toBe('8')
    // No theme-state should still be null
    expect(localStorage.getItem('theme-state')).toBeNull()
  })

  // v7 -> v8 migration tests (strip vnc-viewer from dashboard-state)
  it('v8 migration strips vnc-viewer from dashboard-state widgets', () => {
    localStorage.setItem('app-version', '7')
    localStorage.setItem('dashboard-state', JSON.stringify({
      widgets: [
        { pluginId: 'heartbeat', layout: { x: 0, y: 0, w: 1, h: 2 } },
        { pluginId: 'vnc-viewer', layout: { x: 1, y: 0, w: 3, h: 3 } },
        { pluginId: 'agents', layout: { x: 4, y: 0, w: 2, h: 3 } },
      ]
    }))
    runMigrations()
    const state = JSON.parse(localStorage.getItem('dashboard-state')!)
    expect(state.widgets).toHaveLength(2)
    expect(state.widgets.map((w: { pluginId: string }) => w.pluginId)).toEqual(['heartbeat', 'agents'])
  })

  it('v8 migration is no-op when no dashboard-state exists', () => {
    localStorage.setItem('app-version', '7')
    runMigrations()
    expect(localStorage.getItem('dashboard-state')).toBeNull()
  })

  it('v8 migration is no-op when dashboard-state has no vnc-viewer widgets', () => {
    localStorage.setItem('app-version', '7')
    localStorage.setItem('dashboard-state', JSON.stringify({
      widgets: [
        { pluginId: 'heartbeat', layout: { x: 0, y: 0, w: 1, h: 2 } },
        { pluginId: 'agents', layout: { x: 4, y: 0, w: 2, h: 3 } },
      ]
    }))
    runMigrations()
    const state = JSON.parse(localStorage.getItem('dashboard-state')!)
    expect(state.widgets).toHaveLength(2)
  })
})
