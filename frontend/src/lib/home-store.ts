/**
 * Home Dashboard Store -- reactive state management for the Home page grid.
 *
 * Same useSyncExternalStore pattern as dashboard-store.ts but with a separate
 * localStorage key and a single-page design (no tabs). This keeps the Home
 * page layout fully independent from the agent Dashboard.
 */

import { useSyncExternalStore } from 'react'
import type { DashboardState, LayoutItem } from './dashboard-store'

// Types imported for internal use (no re-export -- consumers import directly from dashboard-store)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'home-dashboard-state'
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
  _redoStack.length = 0
}

// ---------------------------------------------------------------------------
// Public API -- getters & subscriptions
// ---------------------------------------------------------------------------

export function getHomeState(): DashboardState {
  return _cached
}

function subscribeHome(cb: () => void): () => void {
  _listeners.add(cb)
  return () => { _listeners.delete(cb) }
}

// ---------------------------------------------------------------------------
// Public API -- state mutations
// ---------------------------------------------------------------------------

export function setHomeState(next: DashboardState): void {
  _pushUndo()
  _cached = next
  _persist()
  _emit()
}

export function setHomeEditMode(editing: boolean): void {
  if (!editing) {
    _undoStack.length = 0
    _redoStack.length = 0
  }
  _cached = { ..._cached, editMode: editing }
  _persist()
  _emit()
}

function _setHomeWobbleEnabled(enabled: boolean): void {
  _cached = { ..._cached, wobbleEnabled: enabled }
  _persist()
  _emit()
}

export function updateHomePageLayouts(pageId: string, layouts: Record<string, LayoutItem[]>): void {
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

export function updateHomeWidgetConfig(pageId: string, widgetId: string, config: Record<string, unknown>): void {
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

export function addHomeWidgetToPage(pageId: string, pluginId: string, layout: LayoutItem): void {
  _pushUndo()
  _cached = {
    ..._cached,
    pages: _cached.pages.map(p => {
      if (p.id !== pageId) return p
      const breakpoints = Object.keys(p.layouts).length > 0
        ? Object.keys(p.layouts)
        : ['lg']
      const newLayouts = { ...p.layouts }
      for (const bp of breakpoints) {
        newLayouts[bp] = [...(newLayouts[bp] || []), layout]
      }
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

export function removeHomeWidget(pageId: string, widgetId: string): void {
  _pushUndo()
  const page = _cached.pages.find(p => p.id === pageId)
  if (!page) return

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

export function restoreHomeWidget(recycleBinIndex: number): void {
  _pushUndo()
  const item = _cached.recycleBin[recycleBinIndex]
  if (!item) return

  const newRecycleBin = _cached.recycleBin.filter((_, i) => i !== recycleBinIndex)

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

export function clearHomeRecycleBin(): void {
  _pushUndo()
  _cached = { ..._cached, recycleBin: [] }
  _persist()
  _emit()
}

export function undoHome(): boolean {
  const prev = _undoStack.pop()
  if (!prev) return false
  _redoStack.push(structuredClone(_cached))
  _cached = prev
  _persist()
  _emit()
  return true
}

function _redoHome(): boolean {
  const next = _redoStack.pop()
  if (!next) return false
  _undoStack.push(structuredClone(_cached))
  _cached = next
  _persist()
  _emit()
  return true
}

function _resetHomeLayout(pageId: string): void {
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

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useHomeStore(): DashboardState {
  return useSyncExternalStore(subscribeHome, getHomeState)
}
