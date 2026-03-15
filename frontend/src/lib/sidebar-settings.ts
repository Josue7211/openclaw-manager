const STORAGE_KEY = 'sidebar-header-visible'
const WIDTH_KEY = 'sidebar-default-width'
const TITLE_LAYOUT_KEY = 'sidebar-title-layout'
const TITLE_TEXT_KEY = 'sidebar-title-text'
const SEARCH_KEY = 'sidebar-search-visible'

let _visible = localStorage.getItem(STORAGE_KEY) !== 'false'
let _searchVisible = localStorage.getItem(SEARCH_KEY) !== 'false'
let _defaultWidth = (() => {
  const w = parseInt(localStorage.getItem(WIDTH_KEY) || '320', 10)
  return w
})()
let _titleLayout: 'one-line' | 'two-line' = (localStorage.getItem(TITLE_LAYOUT_KEY) as 'one-line' | 'two-line') || 'one-line'
let _titleText = localStorage.getItem(TITLE_TEXT_KEY) || 'OPENCLAW'
const _listeners = new Set<() => void>()

export function getSidebarHeaderVisible(): boolean {
  return _visible
}

export function setSidebarHeaderVisible(v: boolean) {
  _visible = v
  localStorage.setItem(STORAGE_KEY, String(v))
  _listeners.forEach(fn => fn())
}

export function getSidebarDefaultWidth(): number {
  return _defaultWidth
}

export function setSidebarDefaultWidth(w: number) {
  _defaultWidth = Math.max(100, Math.min(400, w))
  localStorage.setItem(WIDTH_KEY, String(_defaultWidth))
  _listeners.forEach(fn => fn())
}

export function getSidebarTitleLayout(): 'one-line' | 'two-line' {
  return _titleLayout
}

export function setSidebarTitleLayout(v: 'one-line' | 'two-line') {
  _titleLayout = v
  localStorage.setItem(TITLE_LAYOUT_KEY, v)
  _listeners.forEach(fn => fn())
}

export function getSidebarTitleText(): string {
  return _titleText
}

export function setSidebarTitleText(v: string) {
  _titleText = v
  if (v.trim()) localStorage.setItem(TITLE_TEXT_KEY, v)
  _listeners.forEach(fn => fn())
}

export function getSidebarSearchVisible(): boolean {
  return _searchVisible
}

export function setSidebarSearchVisible(v: boolean) {
  _searchVisible = v
  localStorage.setItem(SEARCH_KEY, String(v))
  _listeners.forEach(fn => fn())
}

export function subscribeSidebarSettings(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}
