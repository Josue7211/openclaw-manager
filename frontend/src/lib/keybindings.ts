

const STORAGE_KEY = 'keybindings'
const MOD_KEY_STORAGE = 'modifier-key'
const MOD_LIST_STORAGE = 'modifier-list'

type ModifierKey = string

interface Keybinding {
  id: string
  label: string
  key: string           // the key character (lowercase)
  mod: boolean          // requires a modifier
  modifier?: ModifierKey // per-binding modifier override (falls back to global default)
  route?: string        // navigation target
  action?: string       // named action (e.g. 'palette', 'shortcuts')
}

const DEFAULTS: Keybinding[] = [
  // General
  { id: 'palette', label: 'Command palette', key: 'k', mod: true, action: 'palette' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', key: '/', mod: true, action: 'shortcuts' },
  { id: 'undo', label: 'Undo', key: 'z', mod: true, action: 'undo' },
  { id: 'redo', label: 'Redo', key: 'r', mod: true, action: 'redo' },

  // Navigation
  { id: 'nav-home', label: 'Go to Home', key: 'h', mod: true, route: '/' },
  { id: 'nav-dashboard', label: 'Go to Dashboard', key: 'd', mod: true, route: '/dashboard' },
  { id: 'nav-agents', label: 'Go to Agents', key: 'a', mod: true, route: '/agents' },
  { id: 'nav-missions', label: 'Go to Missions', key: 'm', mod: true, route: '/missions' },
  { id: 'nav-calendar', label: 'Go to Calendar', key: 'l', mod: true, route: '/calendar' },
  { id: 'nav-todos', label: 'Go to Todos', key: 't', mod: true, route: '/todos' },
  { id: 'nav-email', label: 'Go to Email', key: 'e', mod: true, route: '/email' },
  { id: 'nav-settings', label: 'Go to Settings', key: 's', mod: true, route: '/settings' },
  { id: 'nav-messages', label: 'Go to Messages', key: 'i', mod: true, route: '/messages' },

  // Dashboard
  { id: 'dashboard-edit', label: 'Edit dashboard', key: 'e', mod: true, action: 'dashboard-edit' },

  // Theme
  { id: 'theme-picker', label: 'Theme picker', key: 't', mod: true, modifier: 'shift', action: 'theme-picker' },
]

function load(): Keybinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Keybinding>[]
      return DEFAULTS.map(def => {
        const override = saved.find(s => s.id === def.id)
        return override ? { ...def, ...override } : def
      })
    }
  } catch { /* ignore */ }
  return [...DEFAULTS]
}

let _bindings: Keybinding[] = load()
let _defaultMod: ModifierKey = (localStorage.getItem(MOD_KEY_STORAGE) as ModifierKey) || 'ctrl'
let _modList: ModifierKey[] = (() => {
  try {
    const stored = localStorage.getItem(MOD_LIST_STORAGE)
    if (stored) { const parsed = JSON.parse(stored); if (Array.isArray(parsed)) return parsed }
  } catch {}
  return [_defaultMod]
})()
const _listeners = new Set<() => void>()

function persist() {
  const defaultsById = new Map(DEFAULTS.map(d => [d.id, d]))
  const overrides = _bindings
    .filter(b => {
      const def = defaultsById.get(b.id)
      return !def || b.key !== def.key || b.modifier !== def.modifier
    })
    .map(({ id, key, modifier }) => ({ id, key, modifier }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function getKeybindings(): Keybinding[] {
  return _bindings
}

export function updateKeybinding(id: string, update: { key?: string; modifier?: ModifierKey }) {
  _bindings = _bindings.map(b => b.id === id ? { ...b, ...update } : b)
  persist()
  _listeners.forEach(fn => fn())
}

export function resetKeybindings() {
  _bindings = [...DEFAULTS]
  localStorage.removeItem(STORAGE_KEY)
  _listeners.forEach(fn => fn())
}

export function getModifierKey(): ModifierKey {
  return _defaultMod
}

export function setModifierKey(key: ModifierKey) {
  _defaultMod = key
  localStorage.setItem(MOD_KEY_STORAGE, key)
  // Ensure it's in the list
  if (!_modList.includes(key)) {
    _modList = [key, ..._modList]
    localStorage.setItem(MOD_LIST_STORAGE, JSON.stringify(_modList))
  }
  _listeners.forEach(fn => fn())
}

export function getModifierList(): ModifierKey[] {
  return _modList
}

export function addModifier(key: ModifierKey) {
  if (_modList.includes(key)) return
  _modList = [..._modList, key]
  localStorage.setItem(MOD_LIST_STORAGE, JSON.stringify(_modList))
  _listeners.forEach(fn => fn())
}

export function reorderModifiers(newList: ModifierKey[]) {
  _modList = newList
  _defaultMod = newList[0]
  localStorage.setItem(MOD_LIST_STORAGE, JSON.stringify(_modList))
  localStorage.setItem(MOD_KEY_STORAGE, _defaultMod)
  _listeners.forEach(fn => fn())
}

export function removeModifier(key: ModifierKey) {
  if (_modList.length <= 1) return // keep at least one
  _modList = _modList.filter(m => m !== key)
  localStorage.setItem(MOD_LIST_STORAGE, JSON.stringify(_modList))
  // If default was removed, set to first remaining
  if (_defaultMod === key) {
    _defaultMod = _modList[0]
    localStorage.setItem(MOD_KEY_STORAGE, _defaultMod)
  }
  _listeners.forEach(fn => fn())
}

/** Get the effective modifier for a binding (per-binding or global default) */
export function getBindingMod(b: Keybinding): ModifierKey {
  return b.modifier || _defaultMod
}

/** Check if the correct modifier is pressed for a specific binding */
export function isBindingModPressed(e: KeyboardEvent, b: Keybinding): boolean {
  const mod = getBindingMod(b)
  switch (mod) {
    case 'alt': return e.altKey
    case 'meta': return e.metaKey
    case 'shift': return e.shiftKey
    case 'ctrl': return e.ctrlKey
    default:
      // For non-standard modifiers, check if that key is currently held
      // via the global key state tracker
      return _heldKeys.has(mod)
  }
}

/**
 * Check whether a binding's additional modifier requirement matches.
 * For bindings with `modifier` set AND `mod: true`, the binding requires
 * both the global mod key AND the specified modifier. Returns true when
 * the extra modifier state matches (pressed when required, not pressed when not required).
 */
export function matchesExtraModifier(e: KeyboardEvent, b: Keybinding): boolean {
  // Binding has an explicit modifier override AND still uses mod: true
  // This means it requires BOTH the global mod + the explicit modifier
  if (!b.modifier) {
    // No extra modifier required — make sure Shift is NOT pressed
    // (to prevent Ctrl+Shift+T matching the Ctrl+T binding)
    return !e.shiftKey
  }
  // Has extra modifier — check the global default mod is also pressed
  const globalMod = _defaultMod
  const globalPressed = (() => {
    switch (globalMod) {
      case 'alt': return e.altKey
      case 'meta': return e.metaKey
      case 'shift': return e.shiftKey
      case 'ctrl': return e.ctrlKey
      default: return _heldKeys.has(globalMod)
    }
  })()
  if (!globalPressed) return false
  // Now check the extra modifier itself
  switch (b.modifier) {
    case 'alt': return e.altKey
    case 'meta': return e.metaKey
    case 'shift': return e.shiftKey
    case 'ctrl': return e.ctrlKey
    default: return _heldKeys.has(b.modifier)
  }
}

/** Convert a KeyboardEvent key to a modifier identifier */
export function keyToModifier(key: string): ModifierKey {
  switch (key) {
    case 'Control': return 'ctrl'
    case 'Alt': return 'alt'
    case 'Meta': return 'meta'
    case 'Shift': return 'shift'
    default: return key.toLowerCase()
  }
}

const BUILTIN_LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  meta: '⌘ Cmd',
  shift: 'Shift',
  ' ': 'Space',
  backquote: '`',
  tab: 'Tab',
}

/** Get display label for a modifier */
export function modLabel(mod: ModifierKey): string {
  return BUILTIN_LABELS[mod] || mod.toUpperCase()
}

// Track held keys for non-standard modifier support
const _heldKeys = new Set<string>()
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => _heldKeys.add(e.key.toLowerCase()))
  window.addEventListener('keyup', e => _heldKeys.delete(e.key.toLowerCase()))
  window.addEventListener('blur', () => _heldKeys.clear())
}

export function subscribeKeybindings(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

/** Format key for display */
export function formatKey(binding: Keybinding): string[] {
  const parts: string[] = []
  if (binding.mod) parts.push(modLabel(getBindingMod(binding)))
  parts.push(binding.key.toUpperCase())
  return parts
}
