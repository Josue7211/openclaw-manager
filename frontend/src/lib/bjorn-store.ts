/**
 * Bjorn Module Store -- CRUD operations backed by the Rust API,
 * hot-reload via blob URL dynamic imports into the Widget Registry,
 * startup loading of persisted modules, and module lifecycle management.
 *
 * This is the bridge between backend persistence (Plan 02) and the
 * frontend Widget Registry. Approved modules become live dashboard widgets.
 */

import { api } from '@/lib/api'
import { registerWidget } from '@/lib/widget-registry'
import type { BjornModule, BjornModuleVersion } from '@/lib/bjorn-types'

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Tracks blob URLs per module id for cleanup */
const _blobUrls = new Map<string, string>()

/** Tracks which module ids are currently registered in widget registry */
const _registered = new Set<string>()

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Wraps the generated component source as an ES module.
 * Appends `export default BjornWidget;` -- the contract is that
 * Bjorn-generated code must define a function named BjornWidget.
 */
export function wrapAsESModule(source: string): string {
  return `${source}\nexport default BjornWidget;`
}

/**
 * Exposes all 11 primitive components on `window.__bjornAPI` so that
 * blob URL modules can access them at runtime without import statements.
 * Call once at startup before loading modules.
 */
export function exposePrimitivesAPI(): void {
  ;(window as any).__bjornAPI = {
    // Lazy references -- blob modules access these at render time
    StatCard: () => import('@/components/primitives/StatCard'),
    LineChart: () => import('@/components/primitives/LineChart'),
    BarChart: () => import('@/components/primitives/BarChart'),
    ProgressGauge: () => import('@/components/primitives/ProgressGauge'),
    MarkdownDisplay: () => import('@/components/primitives/MarkdownDisplay'),
    ListView: () => import('@/components/primitives/ListView'),
    DataTable: () => import('@/components/primitives/DataTable'),
    FormWidget: () => import('@/components/primitives/FormWidget'),
    KanbanBoard: () => import('@/components/primitives/KanbanBoard'),
    TimerCountdown: () => import('@/components/primitives/TimerCountdown'),
    ImageGallery: () => import('@/components/primitives/ImageGallery'),
  }
}

// ---------------------------------------------------------------------------
// Core registration
// ---------------------------------------------------------------------------

/**
 * Registers a BjornModule into the Widget Registry via blob URL dynamic import.
 * Revokes previous blob URL if the module was already registered (hot-reload).
 */
export function registerBjornModule(module: BjornModule): void {
  // Revoke old blob URL if re-registering (hot-reload)
  if (_blobUrls.has(module.id)) {
    URL.revokeObjectURL(_blobUrls.get(module.id)!)
  }

  // Create new blob URL from wrapped source
  const blob = new Blob(
    [wrapAsESModule(module.source)],
    { type: 'application/javascript' }
  )
  const url = URL.createObjectURL(blob)
  _blobUrls.set(module.id, url)

  // Register as a widget
  registerWidget({
    id: 'bjorn-' + module.id,
    name: module.name,
    description: module.description,
    icon: module.icon || 'Cube',
    category: 'custom',
    tier: 'ai',
    defaultSize: module.defaultSize,
    configSchema: module.configSchema,
    component: () => import(/* @vite-ignore */ url),
    metadata: { author: 'Bjorn', version: String(module.version) },
  })

  _registered.add(module.id)
}

/**
 * Unregisters a Bjorn module -- revokes blob URL and removes from tracking.
 * Note: Widget Registry has no unregister function; the widget entry remains
 * but won't appear in any layout so it won't render.
 */
export function unregisterBjornModule(moduleId: string): void {
  if (_blobUrls.has(moduleId)) {
    URL.revokeObjectURL(_blobUrls.get(moduleId)!)
    _blobUrls.delete(moduleId)
  }
  _registered.delete(moduleId)
}

// ---------------------------------------------------------------------------
// API-backed CRUD
// ---------------------------------------------------------------------------

/**
 * Fetches all persisted modules from the backend and registers enabled ones.
 * Called at app startup. Non-fatal on failure (logs warning).
 */
export async function loadBjornModules(): Promise<void> {
  try {
    const data = await api.get<{ modules: BjornModule[] }>('/api/bjorn/modules')
    for (const mod of data.modules) {
      if (mod.enabled) {
        registerBjornModule(mod)
      }
    }
  } catch (err) {
    console.warn('[bjorn-store] Failed to load modules:', err)
  }
}

/**
 * Creates a new module via the backend API and registers it in the widget registry.
 */
export async function saveBjornModule(data: {
  name: string
  description: string
  icon: string
  source: string
  configSchema: BjornModule['configSchema']
  defaultSize: BjornModule['defaultSize']
}): Promise<BjornModule> {
  const result = await api.post<{ module: BjornModule }>('/api/bjorn/modules', data)
  registerBjornModule(result.module)
  return result.module
}

/**
 * Updates an existing module via the backend API and re-registers with new source.
 */
export async function updateBjornModule(
  id: string,
  data: {
    source?: string
    configSchema?: BjornModule['configSchema']
    name?: string
    description?: string
    icon?: string
  }
): Promise<BjornModule> {
  const result = await api.put<{ module: BjornModule }>('/api/bjorn/modules/' + id, data)
  registerBjornModule(result.module)
  return result.module
}

/**
 * Soft-deletes a module via the backend API and unregisters from widget registry.
 */
export async function deleteBjornModule(id: string): Promise<void> {
  await api.del('/api/bjorn/modules/' + id)
  unregisterBjornModule(id)
}

/**
 * Toggles a module's enabled state. Registers on enable, unregisters on disable.
 */
export async function toggleBjornModule(id: string, enabled: boolean): Promise<BjornModule> {
  const result = await api.patch<{ module: BjornModule }>(
    '/api/bjorn/modules/' + id + '/toggle',
    { enabled }
  )
  if (enabled) {
    registerBjornModule(result.module)
  } else {
    unregisterBjornModule(id)
  }
  return result.module
}

/**
 * Rolls back a module to a previous version and re-registers with old source.
 */
export async function rollbackBjornModule(id: string, version: number): Promise<BjornModule> {
  const result = await api.post<{ module: BjornModule }>(
    '/api/bjorn/modules/' + id + '/rollback',
    { version }
  )
  registerBjornModule(result.module)
  return result.module
}

/**
 * Fetches the version history for a module.
 */
export async function getBjornVersions(id: string): Promise<BjornModuleVersion[]> {
  const result = await api.get<{ versions: BjornModuleVersion[] }>(
    '/api/bjorn/modules/' + id + '/versions'
  )
  return result.versions
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Resets internal state for testing. NOT for production use. */
export function _resetForTesting(): void {
  for (const url of _blobUrls.values()) {
    URL.revokeObjectURL(url)
  }
  _blobUrls.clear()
  _registered.clear()
  delete (window as any).__bjornAPI
}
