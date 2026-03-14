import { describe, it, expect, vi, beforeEach } from 'vitest'

let runMigrations: typeof import('../migrations').runMigrations

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('../migrations')
  runMigrations = mod.runMigrations
})

describe('runMigrations', () => {
  it('sets app-version to "1" when no stored version exists', () => {
    runMigrations()
    expect(localStorage.getItem('app-version')).toBe('1')
  })

  it('skips migration body when version is already "1"', () => {
    localStorage.setItem('app-version', '1')
    localStorage.setItem('dnd-enabled', 'true')

    const spy = vi.spyOn(Storage.prototype, 'setItem')
    runMigrations()

    // Should only set app-version, not touch any boolean keys
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
    expect(localStorage.getItem('app-version')).toBe('1')
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
    expect(localStorage.getItem('app-version')).toBe('1')
  })
})
