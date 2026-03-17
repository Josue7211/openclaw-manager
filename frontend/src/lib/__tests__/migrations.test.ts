import { describe, it, expect, vi, beforeEach } from 'vitest'

let runMigrations: typeof import('../migrations').runMigrations

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('../migrations')
  runMigrations = mod.runMigrations
})

describe('runMigrations', () => {
  it('sets app-version to "2" when no stored version exists', () => {
    runMigrations()
    expect(localStorage.getItem('app-version')).toBe('3')
  })

  it('skips all migration bodies when version is already current', () => {
    localStorage.setItem('app-version', '3')
    localStorage.setItem('dnd-enabled', 'true')
    localStorage.setItem('enabled-modules', JSON.stringify(['chat']))

    const spy = vi.spyOn(Storage.prototype, 'setItem')
    runMigrations()

    // Should only set app-version, not touch any other keys
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
    expect(localStorage.getItem('app-version')).toBe('3')
  })

  it('does not touch keys that have non-boolean values', () => {
    localStorage.setItem('dnd-enabled', 'custom-value')

    runMigrations()

    // Non-boolean values are not "true" or "false", so the migration
    // if-guards skip them — the value should remain unchanged.
    expect(localStorage.getItem('dnd-enabled')).toBe('custom-value')
  })

  it('handles keys that do not exist in localStorage', () => {
    // Only set one key, leave the rest absent
    localStorage.setItem('in-app-notifs', 'true')

    runMigrations()

    expect(localStorage.getItem('in-app-notifs')).toBe('true')
    expect(localStorage.getItem('dnd-enabled')).toBeNull()
    expect(localStorage.getItem('app-version')).toBe('3')
  })

  // v1 -> v2 migration tests
  it('appends new modules to existing enabled-modules list', () => {
    localStorage.setItem('app-version', '1')
    // Simulates a v1 user who had all old modules enabled
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
    // Original modules preserved in order
    expect(updated.slice(0, oldModules.length)).toEqual(oldModules)
    expect(localStorage.getItem('app-version')).toBe('3')
  })

  it('does not duplicate modules that are already in the list', () => {
    localStorage.setItem('app-version', '1')
    const existing = ['chat', 'notes', 'status']
    localStorage.setItem('enabled-modules', JSON.stringify(existing))

    runMigrations()

    const updated = JSON.parse(localStorage.getItem('enabled-modules')!)
    // notes and status were already present, so they should not appear twice
    expect(updated.filter((id: string) => id === 'notes')).toHaveLength(1)
    expect(updated.filter((id: string) => id === 'status')).toHaveLength(1)
    // But missing modules should be appended
    expect(updated).toContain('messages')
    expect(updated).toContain('todos')
  })

  it('does not touch enabled-modules when none are stored', () => {
    localStorage.setItem('app-version', '1')
    // No enabled-modules key — user gets defaults from modules.ts

    runMigrations()

    expect(localStorage.getItem('enabled-modules')).toBeNull()
    expect(localStorage.getItem('app-version')).toBe('3')
  })

  it('handles invalid JSON in enabled-modules gracefully', () => {
    localStorage.setItem('app-version', '1')
    localStorage.setItem('enabled-modules', 'not-valid-json')

    runMigrations()

    // Should leave invalid data untouched — modules.ts falls back to defaults
    expect(localStorage.getItem('enabled-modules')).toBe('not-valid-json')
    expect(localStorage.getItem('app-version')).toBe('3')
  })

  it('runs both v0->v1 and v1->v2 migrations from fresh install', () => {
    // Simulate fresh install with no version and some old boolean keys
    localStorage.setItem('dnd-enabled', 'true')
    const oldModules = ['chat', 'todos']
    localStorage.setItem('enabled-modules', JSON.stringify(oldModules))

    runMigrations()

    // v0->v1 ran (boolean key preserved)
    expect(localStorage.getItem('dnd-enabled')).toBe('true')
    // v1->v2 ran (new modules appended)
    const updated = JSON.parse(localStorage.getItem('enabled-modules')!)
    expect(updated).toContain('notes')
    expect(updated).toContain('status')
    expect(updated).toContain('chat')
    expect(updated).toContain('todos')
    expect(localStorage.getItem('app-version')).toBe('3')
  })

  // v2 -> v3 migration tests
  it('removes mc-notes-vault and notes-data from localStorage', () => {
    localStorage.setItem('app-version', '2')
    localStorage.setItem('mc-notes-vault', JSON.stringify([{ _id: 'test', content: 'secret note body' }]))
    localStorage.setItem('notes-data', JSON.stringify([{ id: '1', content: 'legacy note' }]))

    runMigrations()

    expect(localStorage.getItem('mc-notes-vault')).toBeNull()
    expect(localStorage.getItem('notes-data')).toBeNull()
    expect(localStorage.getItem('app-version')).toBe('3')
  })

  it('does not error when mc-notes-vault and notes-data are absent', () => {
    localStorage.setItem('app-version', '2')

    runMigrations()

    expect(localStorage.getItem('mc-notes-vault')).toBeNull()
    expect(localStorage.getItem('notes-data')).toBeNull()
    expect(localStorage.getItem('app-version')).toBe('3')
  })
})
