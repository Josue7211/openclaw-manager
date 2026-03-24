/**
 * Dashboard Store — reactive state management for the dashboard grid.
 *
 * Follows the same useSyncExternalStore pattern as sidebar-config.ts.
 * Manages: pages, active page, edit mode, layouts, widget configs,
 * recycle bin, undo/redo, wobble toggle, and localStorage persistence.
 */

import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayoutItem {
  i: string    // widget instance ID
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  static?: boolean
}

export interface DashboardPage {
  id: string
  name: string
  sortOrder: number
  layouts: Record<string, LayoutItem[]>  // keyed by breakpoint: lg, md, sm, xs
  widgetConfigs: Record<string, Record<string, unknown>>  // per-widget instance config
}

export interface RecycleBinItem {
  widgetId: string
  pluginId: string
  removedAt: string       // ISO timestamp
  previousPosition: LayoutItem
  previousPageId: string
}

export interface DashboardState {
  pages: DashboardPage[]
  activePageId: string
  editMode: boolean
  wobbleEnabled: boolean
  dotIndicatorsEnabled: boolean
  recycleBin: RecycleBinItem[]
  lastModified: string    // ISO timestamp for sync conflict resolution
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'dashboard-state'
const MAX_UNDO = 30
const MAX_RECYCLE_BIN = 20

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const _listeners = new Set<() => void>()
let _cached: DashboardState = loadFromLocalStorage()
const _undoStack: DashboardState[] = []
const _redoStack: DashboardState[] = []

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createInitialState(): DashboardState {
  const homeId = crypto.randomUUID()
  return {
    pages: [{
      id: homeId,
      name: 'Home',
      sortOrder: 0,
      layouts: {},
      widgetConfigs: {},
    }],
    activePageId: homeId,
    editMode: false,
    wobbleEnabled: true,
    dotIndicatorsEnabled: false,
    recycleBin: [],
    lastModified: new Date().toISOString(),
  }
}

function loadFromLocalStorage(): DashboardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DashboardState
      if (parsed && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        return parsed
      }
    }
  } catch { /* fall through */ }
  return createInitialState()
}

function _emit(): void {
  _listeners.forEach(fn => fn())
}

function _persist(): void {
  _cached.lastModified = new Date().toISOString()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_cached))
}

function _pushUndo(): void {
  _undoStack.push(structuredClone(_cached))
  if (_undoStack.length > MAX_UNDO) _undoStack.shift()
  // New edit invalidates redo history
  _redoStack.length = 0
}

// ---------------------------------------------------------------------------
// Public API — getters & subscriptions
// ---------------------------------------------------------------------------

export function getDashboardState(): DashboardState {
  return _cached
}

export function subscribeDashboard(cb: () => void): () => void {
  _listeners.add(cb)
  return () => { _listeners.delete(cb) }
}

// ---------------------------------------------------------------------------
// Public API — state mutations
// ---------------------------------------------------------------------------

export function setDashboardState(next: DashboardState): void {
  _pushUndo()
  _cached = next
  _persist()
  _emit()
}

export function setEditMode(editing: boolean): void {
  if (!editing) {
    // Exiting edit mode clears undo/redo stacks
    _undoStack.length = 0
    _redoStack.length = 0
  }
  _cached = { ..._cached, editMode: editing }
  _persist()
  _emit()
}

export function setWobbleEnabled(enabled: boolean): void {
  _cached = { ..._cached, wobbleEnabled: enabled }
  _persist()
  _emit()
}

function setDotIndicatorsEnabled(enabled: boolean): void {
  _cached = { ..._cached, dotIndicatorsEnabled: enabled }
  _persist()
  _emit()
}

export function addPage(name: string): string {
  _pushUndo()
  const id = crypto.randomUUID()
  const newPage: DashboardPage = {
    id,
    name,
    sortOrder: _cached.pages.length,
    layouts: {},
    widgetConfigs: {},
  }
  _cached = {
    ..._cached,
    pages: [..._cached.pages, newPage],
  }
  _persist()
  _emit()
  return id
}

export function removePage(pageId: string): void {
  _pushUndo()
  const page = _cached.pages.find(p => p.id === pageId)
  if (!page) return

  // Move page widgets to recycle bin
  const newRecycleBin = [..._cached.recycleBin]
  for (const [, items] of Object.entries(page.layouts)) {
    for (const item of items as LayoutItem[]) {
      newRecycleBin.push({
        widgetId: item.i,
        pluginId: item.i,
        removedAt: new Date().toISOString(),
        previousPosition: { ...item },
        previousPageId: pageId,
      })
    }
  }

  // Trim recycle bin
  while (newRecycleBin.length > MAX_RECYCLE_BIN) {
    newRecycleBin.shift()
  }

  const remainingPages = _cached.pages.filter(p => p.id !== pageId)
  let activePageId = _cached.activePageId
  if (activePageId === pageId && remainingPages.length > 0) {
    activePageId = remainingPages[0].id
  }

  _cached = {
    ..._cached,
    pages: remainingPages,
    activePageId,
    recycleBin: newRecycleBin,
  }
  _persist()
  _emit()
}

export function renamePage(pageId: string, name: string): void {
  _pushUndo()
  _cached = {
    ..._cached,
    pages: _cached.pages.map(p =>
      p.id === pageId ? { ...p, name } : p
    ),
  }
  _persist()
  _emit()
}

function reorderPages(pageIds: string[]): void {
  _pushUndo()
  const pageMap = new Map(_cached.pages.map(p => [p.id, p]))
  const reordered = pageIds
    .filter(id => pageMap.has(id))
    .map((id, idx) => ({ ...pageMap.get(id)!, sortOrder: idx }))

  _cached = { ..._cached, pages: reordered }
  _persist()
  _emit()
}

export function setActivePage(pageId: string): void {
  // Does NOT push to undo stack (per spec)
  _cached = { ..._cached, activePageId: pageId }
  _persist()
  _emit()
}

export function updatePageLayouts(pageId: string, layouts: Record<string, LayoutItem[]>): void {
  _pushUndo()
  _cached = {
    ..._cached,
    pages: _cached.pages.map(p =>
      p.id === pageId
        ? { ...p, layouts: { ...p.layouts, ...layouts } }
        : p
    ),
  }
  _persist()
  _emit()
}

export function updateWidgetConfig(pageId: string, widgetId: string, config: Record<string, unknown>): void {
  _pushUndo()
  _cached = {
    ..._cached,
    pages: _cached.pages.map(p =>
      p.id === pageId
        ? {
            ...p,
            widgetConfigs: { ...p.widgetConfigs, [widgetId]: config },
          }
        : p
    ),
  }
  _persist()
  _emit()
}

export function addWidgetToPage(pageId: string, pluginId: string, layout: LayoutItem): void {
  _pushUndo()
  _cached = {
    ..._cached,
    pages: _cached.pages.map(p => {
      if (p.id !== pageId) return p
      // Add layout item to all breakpoints that exist, or to a default 'lg'
      const breakpoints = Object.keys(p.layouts).length > 0
        ? Object.keys(p.layouts)
        : ['lg']
      const newLayouts = { ...p.layouts }
      for (const bp of breakpoints) {
        newLayouts[bp] = [...(newLayouts[bp] || []), layout]
      }
      // Store pluginId in widgetConfigs so DashboardGrid can resolve the registry ID
      const newConfigs = {
        ...p.widgetConfigs,
        [layout.i]: { ...p.widgetConfigs[layout.i], _pluginId: pluginId },
      }
      return { ...p, layouts: newLayouts, widgetConfigs: newConfigs }
    }),
  }
  _persist()
  _emit()
}

export function removeWidget(pageId: string, widgetId: string): void {
  _pushUndo()
  const page = _cached.pages.find(p => p.id === pageId)
  if (!page) return

  // Find the widget's position across all breakpoint layouts
  let previousPosition: LayoutItem | undefined
  for (const items of Object.values(page.layouts)) {
    const found = (items as LayoutItem[]).find(item => item.i === widgetId)
    if (found) {
      previousPosition = { ...found }
      break
    }
  }

  if (!previousPosition) {
    previousPosition = { i: widgetId, x: 0, y: 0, w: 4, h: 2 }
  }

  // Read _pluginId from widgetConfigs (set by addWidgetToPage), fall back to widgetId for built-in singletons
  const resolvedPluginId = String(page.widgetConfigs[widgetId]?._pluginId ?? widgetId)

  const newRecycleBin = [
    ..._cached.recycleBin,
    {
      widgetId,
      pluginId: resolvedPluginId,
      removedAt: new Date().toISOString(),
      previousPosition,
      previousPageId: pageId,
    },
  ]

  // Trim recycle bin
  while (newRecycleBin.length > MAX_RECYCLE_BIN) {
    newRecycleBin.shift()
  }

  _cached = {
    ..._cached,
    pages: _cached.pages.map(p => {
      if (p.id !== pageId) return p
      const newLayouts: Record<string, LayoutItem[]> = {}
      for (const [bp, items] of Object.entries(p.layouts)) {
        newLayouts[bp] = (items as LayoutItem[]).filter(item => item.i !== widgetId)
      }
      const { [widgetId]: _, ...remainingConfigs } = p.widgetConfigs
      return { ...p, layouts: newLayouts, widgetConfigs: remainingConfigs }
    }),
    recycleBin: newRecycleBin,
  }
  _persist()
  _emit()
}

export function restoreWidget(recycleBinIndex: number): void {
  _pushUndo()
  const item = _cached.recycleBin[recycleBinIndex]
  if (!item) return

  const newRecycleBin = _cached.recycleBin.filter((_, i) => i !== recycleBinIndex)

  // Restore widget to original page (or the first page if original was deleted)
  const targetPageId = _cached.pages.find(p => p.id === item.previousPageId)
    ? item.previousPageId
    : _cached.pages[0]?.id

  if (!targetPageId) {
    _cached = { ..._cached, recycleBin: newRecycleBin }
    _persist()
    _emit()
    return
  }

  _cached = {
    ..._cached,
    pages: _cached.pages.map(p => {
      if (p.id !== targetPageId) return p
      const breakpoints = Object.keys(p.layouts).length > 0
        ? Object.keys(p.layouts)
        : ['lg']
      const newLayouts = { ...p.layouts }
      for (const bp of breakpoints) {
        newLayouts[bp] = [...(newLayouts[bp] || []), item.previousPosition]
      }
      return { ...p, layouts: newLayouts }
    }),
    recycleBin: newRecycleBin,
  }
  _persist()
  _emit()
}

export function clearRecycleBin(): void {
  _pushUndo()
  _cached = { ..._cached, recycleBin: [] }
  _persist()
  _emit()
}

export function undoDashboard(): boolean {
  const prev = _undoStack.pop()
  if (!prev) return false
  _redoStack.push(structuredClone(_cached))
  _cached = prev
  _persist()
  _emit()
  return true
}

export function redoDashboard(): boolean {
  const next = _redoStack.pop()
  if (!next) return false
  _undoStack.push(structuredClone(_cached))
  _cached = next
  _persist()
  _emit()
  return true
}

function resetPageLayout(pageId: string): void {
  _pushUndo()
  _cached = {
    ..._cached,
    pages: _cached.pages.map(p =>
      p.id === pageId ? { ...p, layouts: {}, widgetConfigs: {} } : p
    ),
  }
  _persist()
  _emit()
}

function resetAllLayouts(): void {
  _pushUndo()
  _cached = {
    ..._cached,
    pages: _cached.pages.map(p => ({ ...p, layouts: {}, widgetConfigs: {} })),
  }
  _persist()
  _emit()
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useDashboardStore(): DashboardState {
  return useSyncExternalStore(subscribeDashboard, getDashboardState)
}
