import { describe, it, expect, vi, beforeEach } from 'vitest'

// The module keeps state in module-level variables, so we need to
// re-import a fresh copy for each test to avoid cross-test leakage.
let getKeybindings: typeof import('../keybindings').getKeybindings
let updateKeybinding: typeof import('../keybindings').updateKeybinding
let resetKeybindings: typeof import('../keybindings').resetKeybindings
let subscribeKeybindings: typeof import('../keybindings').subscribeKeybindings
let formatKey: typeof import('../keybindings').formatKey
let getModifierKey: typeof import('../keybindings').getModifierKey
let setModifierKey: typeof import('../keybindings').setModifierKey
let getModifierList: typeof import('../keybindings').getModifierList
let addModifier: typeof import('../keybindings').addModifier
let removeModifier: typeof import('../keybindings').removeModifier
let reorderModifiers: typeof import('../keybindings').reorderModifiers
let keyToModifier: typeof import('../keybindings').keyToModifier
let modLabel: typeof import('../keybindings').modLabel
let getBindingMod: typeof import('../keybindings').getBindingMod

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
  getModifierKey = mod.getModifierKey
  setModifierKey = mod.setModifierKey
  getModifierList = mod.getModifierList
  addModifier = mod.addModifier
  removeModifier = mod.removeModifier
  reorderModifiers = mod.reorderModifiers
  keyToModifier = mod.keyToModifier
  modLabel = mod.modLabel
  getBindingMod = mod.getBindingMod
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

describe('getModifierKey / setModifierKey', () => {
  it('defaults to ctrl when localStorage is empty', () => {
    expect(getModifierKey()).toBe('ctrl')
  })

  it('persists and returns the new modifier key', () => {
    setModifierKey('meta')
    expect(getModifierKey()).toBe('meta')
    expect(localStorage.getItem('modifier-key')).toBe('meta')
  })

  it('loads saved modifier key on fresh import', async () => {
    localStorage.setItem('modifier-key', 'alt')
    vi.resetModules()
    const mod = await import('../keybindings')
    expect(mod.getModifierKey()).toBe('alt')
  })

  it('notifies listeners when modifier key changes', () => {
    const cb = vi.fn()
    subscribeKeybindings(cb)
    setModifierKey('shift')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('adds the new modifier to the modifier list if not already present', () => {
    setModifierKey('meta')
    expect(getModifierList()).toContain('meta')
  })

  it('does not duplicate if modifier is already in list', () => {
    addModifier('alt')
    const countBefore = getModifierList().filter(m => m === 'alt').length
    setModifierKey('alt')
    const countAfter = getModifierList().filter(m => m === 'alt').length
    expect(countAfter).toBe(countBefore)
  })
})

describe('addModifier', () => {
  it('adds a new modifier to the list', () => {
    addModifier('alt')
    expect(getModifierList()).toContain('alt')
  })

  it('persists the modifier list to localStorage', () => {
    addModifier('alt')
    const stored = JSON.parse(localStorage.getItem('modifier-list')!)
    expect(stored).toContain('alt')
  })

  it('does not add duplicates', () => {
    addModifier('alt')
    addModifier('alt')
    const count = getModifierList().filter(m => m === 'alt').length
    expect(count).toBe(1)
  })

  it('notifies listeners', () => {
    const cb = vi.fn()
    subscribeKeybindings(cb)
    addModifier('shift')
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('removeModifier', () => {
  it('removes a modifier from the list', () => {
    addModifier('alt')
    addModifier('shift')
    removeModifier('alt')
    expect(getModifierList()).not.toContain('alt')
  })

  it('does not remove the last modifier (keeps at least one)', () => {
    // Default list has only ['ctrl']
    removeModifier('ctrl')
    expect(getModifierList().length).toBeGreaterThanOrEqual(1)
    expect(getModifierList()).toContain('ctrl')
  })

  it('updates default modifier if removed modifier was the default', () => {
    addModifier('alt')
    setModifierKey('ctrl')
    // Now default is ctrl, list is [ctrl, alt] (or similar)
    removeModifier('ctrl')
    // Default should now be the first remaining modifier
    expect(getModifierKey()).not.toBe('ctrl')
    expect(getModifierList()).toContain(getModifierKey())
  })

  it('does not change default modifier if a non-default modifier is removed', () => {
    addModifier('alt')
    addModifier('shift')
    const defaultBefore = getModifierKey()
    removeModifier('shift')
    expect(getModifierKey()).toBe(defaultBefore)
  })

  it('notifies listeners', () => {
    addModifier('alt')
    const cb = vi.fn()
    subscribeKeybindings(cb)
    removeModifier('alt')
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('reorderModifiers', () => {
  it('sets the modifier list to the new order', () => {
    addModifier('alt')
    addModifier('shift')
    reorderModifiers(['shift', 'alt', 'ctrl'])
    expect(getModifierList()).toEqual(['shift', 'alt', 'ctrl'])
  })

  it('sets the default modifier to the first item in the new list', () => {
    addModifier('alt')
    reorderModifiers(['alt', 'ctrl'])
    expect(getModifierKey()).toBe('alt')
  })

  it('persists both list and default to localStorage', () => {
    addModifier('meta')
    reorderModifiers(['meta', 'ctrl'])
    expect(JSON.parse(localStorage.getItem('modifier-list')!)).toEqual(['meta', 'ctrl'])
    expect(localStorage.getItem('modifier-key')).toBe('meta')
  })

  it('notifies listeners', () => {
    addModifier('alt')
    const cb = vi.fn()
    subscribeKeybindings(cb)
    reorderModifiers(['alt', 'ctrl'])
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('keyToModifier', () => {
  it('converts Control to ctrl', () => {
    expect(keyToModifier('Control')).toBe('ctrl')
  })

  it('converts Alt to alt', () => {
    expect(keyToModifier('Alt')).toBe('alt')
  })

  it('converts Meta to meta', () => {
    expect(keyToModifier('Meta')).toBe('meta')
  })

  it('converts Shift to shift', () => {
    expect(keyToModifier('Shift')).toBe('shift')
  })

  it('lowercases arbitrary keys', () => {
    expect(keyToModifier('CapsLock')).toBe('capslock')
    expect(keyToModifier('F1')).toBe('f1')
    expect(keyToModifier('a')).toBe('a')
  })
})

describe('modLabel', () => {
  it('returns Ctrl for ctrl', () => {
    expect(modLabel('ctrl')).toBe('Ctrl')
  })

  it('returns Alt for alt', () => {
    expect(modLabel('alt')).toBe('Alt')
  })

  it('returns command symbol for meta', () => {
    expect(modLabel('meta')).toBe('⌘ Cmd')
  })

  it('returns Shift for shift', () => {
    expect(modLabel('shift')).toBe('Shift')
  })

  it('returns Space for space character', () => {
    expect(modLabel(' ')).toBe('Space')
  })

  it('uppercases unknown modifiers', () => {
    expect(modLabel('capslock')).toBe('CAPSLOCK')
    expect(modLabel('f1')).toBe('F1')
  })
})

describe('getBindingMod', () => {
  it('returns binding-specific modifier when set', () => {
    const binding = { id: 'test', label: 'Test', key: 'k', mod: true, modifier: 'alt' as const }
    expect(getBindingMod(binding)).toBe('alt')
  })

  it('falls back to global default when no binding modifier is set', () => {
    const binding = { id: 'test', label: 'Test', key: 'k', mod: true }
    expect(getBindingMod(binding)).toBe(getModifierKey())
  })

  it('uses updated global default after setModifierKey', () => {
    setModifierKey('meta')
    const binding = { id: 'test', label: 'Test', key: 'k', mod: true }
    expect(getBindingMod(binding)).toBe('meta')
  })
})
