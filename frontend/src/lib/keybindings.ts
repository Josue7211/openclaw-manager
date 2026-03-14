

const STORAGE_KEY = 'keybindings'

export interface Keybinding {
  id: string
  label: string
  key: string        // the key character (lowercase)
  mod: boolean       // requires Cmd/Ctrl
  route?: string     // navigation target
  action?: string    // named action (e.g. 'palette', 'shortcuts')
}

const DEFAULTS: Keybinding[] = [
  // General
  { id: 'palette', label: 'Command palette', key: 'k', mod: true, action: 'palette' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', key: '/', mod: true, action: 'shortcuts' },

  // Navigation — Cmd/Ctrl + key
  { id: 'nav-home', label: 'Go to Home', key: 'h', mod: true, route: '/' },
  { id: 'nav-dashboard', label: 'Go to Dashboard', key: 'd', mod: true, route: '/dashboard' },
  { id: 'nav-agents', label: 'Go to Agents', key: 'a', mod: true, route: '/agents' },
  { id: 'nav-missions', label: 'Go to Missions', key: 'm', mod: true, route: '/missions' },
  { id: 'nav-calendar', label: 'Go to Calendar', key: 'l', mod: true, route: '/calendar' },
  { id: 'nav-todos', label: 'Go to Todos', key: 't', mod: true, route: '/todos' },
  { id: 'nav-email', label: 'Go to Email', key: 'e', mod: true, route: '/email' },
  { id: 'nav-settings', label: 'Go to Settings', key: ',', mod: true, route: '/settings' },
  { id: 'nav-messages', label: 'Go to Messages', key: 'i', mod: true, route: '/messages' },
]

function load(): Keybinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Keybinding>[]
      // Merge saved overrides with defaults
      return DEFAULTS.map(def => {
        const override = saved.find(s => s.id === def.id)
        return override ? { ...def, ...override } : def
      })
    }
  } catch { /* ignore */ }
  return [...DEFAULTS]
}

let _bindings: Keybinding[] = load()
const _listeners = new Set<() => void>()

export function getKeybindings(): Keybinding[] {
  return _bindings
}

export function updateKeybinding(id: string, key: string) {
  _bindings = _bindings.map(b => b.id === id ? { ...b, key } : b)
  // Save only overrides (where key differs from default)
  const defaultsById = new Map(DEFAULTS.map(d => [d.id, d]))
  const overrides = _bindings
    .filter(b => {
      const def = defaultsById.get(b.id)
      return !def || b.key !== def.key
    })
    .map(({ id, key }) => ({ id, key }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  _listeners.forEach(fn => fn())
}

export function resetKeybindings() {
  _bindings = [...DEFAULTS]
  localStorage.removeItem(STORAGE_KEY)
  _listeners.forEach(fn => fn())
}

export function subscribeKeybindings(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

/** Format key for display: ⌘ on Mac, Ctrl on others */
export function formatKey(binding: Keybinding): string[] {
  const isMac = navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac')
  const parts: string[] = []
  if (binding.mod) parts.push(isMac ? '⌘' : 'Ctrl')
  parts.push(binding.key.toUpperCase())
  return parts
}
