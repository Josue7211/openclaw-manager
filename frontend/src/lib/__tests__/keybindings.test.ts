import { describe, it, expect, vi, beforeEach } from 'vitest'

// The module keeps state in module-level variables, so we need to
// re-import a fresh copy for each test to avoid cross-test leakage.
let getKeybindings: typeof import('../keybindings').getKeybindings
let updateKeybinding: typeof import('../keybindings').updateKeybinding
let resetKeybindings: typeof import('../keybindings').resetKeybindings
let subscribeKeybindings: typeof import('../keybindings').subscribeKeybindings
let formatKey: typeof import('../keybindings').formatKey

beforeEach(async () => {
  localStorage.clear()
  // Reset the module so module-level `_bindings` is re-initialised
  vi.resetModules()
  const mod = await import('../keybindings')
  getKeybindings = mod.getKeybindings
  updateKeybinding = mod.updateKeybinding
  resetKeybindings = mod.resetKeybindings
  subscribeKeybindings = mod.subscribeKeybindings
  formatKey = mod.formatKey
})

describe('getKeybindings', () => {
  it('returns defaults when localStorage is empty', () => {
    const bindings = getKeybindings()
    expect(bindings.length).toBeGreaterThan(0)
    // Spot-check a known default
    const palette = bindings.find(b => b.id === 'palette')
    expect(palette).toBeDefined()
    expect(palette!.key).toBe('k')
    expect(palette!.mod).toBe(true)
    expect(palette!.action).toBe('palette')
  })
})

describe('updateKeybinding', () => {
  it('changes the key for a binding', () => {
    updateKeybinding('palette', { key: 'j' })
    const palette = getKeybindings().find(b => b.id === 'palette')
    expect(palette!.key).toBe('j')
  })

  it('persists overrides to localStorage', () => {
    updateKeybinding('palette', { key: 'x' })
    const stored = JSON.parse(localStorage.getItem('keybindings')!)
    expect(stored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'palette', key: 'x' }),
      ]),
    )
  })

  it('does not persist bindings that match the default', () => {
    // Change then change back to the default key
    updateKeybinding('palette', { key: 'z' })
    updateKeybinding('palette', { key: 'k' }) // 'k' is the default
    const stored = JSON.parse(localStorage.getItem('keybindings')!)
    const paletteOverride = stored.find((s: { id: string }) => s.id === 'palette')
    expect(paletteOverride).toBeUndefined()
  })
})

describe('resetKeybindings', () => {
  it('restores defaults and clears localStorage', () => {
    updateKeybinding('palette', { key: 'z' })
    expect(getKeybindings().find(b => b.id === 'palette')!.key).toBe('z')

    resetKeybindings()

    expect(getKeybindings().find(b => b.id === 'palette')!.key).toBe('k')
    expect(localStorage.getItem('keybindings')).toBeNull()
  })
})

describe('formatKey', () => {
  it('returns modifier label and uppercased key with default mod (ctrl)', () => {
    // Default modifier is 'ctrl', so formatKey returns 'Ctrl' regardless of platform
    const parts = formatKey({ id: 'test', label: 'Test', key: 'k', mod: true })
    expect(parts).toEqual(['Ctrl', 'K'])
  })

  it('returns meta modifier label when binding overrides modifier to meta', () => {
    const parts = formatKey({ id: 'test', label: 'Test', key: 'd', mod: true, modifier: 'meta' })
    expect(parts).toEqual(['⌘ Cmd', 'D'])
  })

  it('returns only the uppercased key when mod is false', () => {
    const parts = formatKey({ id: 'test', label: 'Test', key: 'a', mod: false })
    expect(parts).toEqual(['A'])
  })
})

describe('subscribeKeybindings', () => {
  it('fires callback on updateKeybinding', () => {
    const cb = vi.fn()
    subscribeKeybindings(cb)
    updateKeybinding('palette', { key: 'q' })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires callback on resetKeybindings', () => {
    const cb = vi.fn()
    subscribeKeybindings(cb)
    resetKeybindings()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('returns an unsubscribe function that stops notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeKeybindings(cb)
    unsub()
    updateKeybinding('palette', { key: 'w' })
    expect(cb).not.toHaveBeenCalled()
  })
})
