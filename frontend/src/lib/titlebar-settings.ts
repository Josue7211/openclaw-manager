const VISIBLE_KEY = 'title-bar-visible'
const AUTOHIDE_KEY = 'titlebar-autohide'

let _visible = localStorage.getItem(VISIBLE_KEY) !== 'false'
let _autoHide = (() => {
  try { return JSON.parse(localStorage.getItem(AUTOHIDE_KEY) || 'false') } catch { return false }
})()
const _listeners = new Set<() => void>()

export function getTitleBarVisible(): boolean {
  return _visible
}

export function setTitleBarVisible(v: boolean) {
  _visible = v
  localStorage.setItem(VISIBLE_KEY, String(v))
  _listeners.forEach(fn => fn())
}

export function getTitleBarAutoHide(): boolean {
  return _autoHide
}

export function setTitleBarAutoHide(v: boolean) {
  _autoHide = v
  localStorage.setItem(AUTOHIDE_KEY, JSON.stringify(v))
  _listeners.forEach(fn => fn())
}

export function subscribeTitleBarSettings(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}
