const STORAGE_KEY = 'sidebar-header-visible'

let _visible = localStorage.getItem(STORAGE_KEY) !== 'false'
const _listeners = new Set<() => void>()

export function getSidebarHeaderVisible(): boolean {
  return _visible
}

export function setSidebarHeaderVisible(v: boolean) {
  _visible = v
  localStorage.setItem(STORAGE_KEY, String(v))
  _listeners.forEach(fn => fn())
}

export function subscribeSidebarSettings(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}
