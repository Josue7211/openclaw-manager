/**
 * Generated module store -- CRUD operations backed by the Rust API,
 * hot-reload via blob URL dynamic imports into the widget registry,
 * startup loading of persisted modules, and module lifecycle management.
 */

import React from 'react'
import { api } from '@/lib/api'
import { registerWidget } from '@/lib/widget-registry'
import { PRIMITIVE_COMPONENTS } from '@/components/primitives/register'
import { OpenUiSnippet } from '@/lib/openui'
import type { WidgetModule, WidgetModuleVersion } from '@/lib/generated-module-types'

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
 * Appends `export default GeneratedWidget;` -- the contract is that
 * generated module code must define a function named GeneratedWidget.
 */
export function wrapAsESModule(source: string): string {
  return `${source}\nexport default GeneratedWidget;`
}

/**
 * Exposes all 11 primitive components on `window.__generatedModuleAPI` so that
 * blob URL modules can access them at runtime without import statements.
 * Call once at startup before loading modules.
 */
export function exposePrimitivesAPI(): void {
  ;(window as any).__generatedModuleAPI = {
    React,
    ...PRIMITIVE_COMPONENTS,
    OpenUiSnippet,
  }
}

// ---------------------------------------------------------------------------
// Core registration
// ---------------------------------------------------------------------------

/**
 * Registers a generated module into the widget registry via blob URL dynamic import.
 * Revokes previous blob URL if the module was already registered (hot-reload).
 */
export function registerGeneratedModule(module: WidgetModule): void {
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
    id: 'generated-' + module.id,
    name: module.name,
    description: module.description,
    icon: module.icon || 'Cube',
    category: 'custom',
    tier: 'ai',
    defaultSize: module.defaultSize,
    configSchema: module.configSchema,
    component: () => import(/* @vite-ignore */ url),
    metadata: { author: 'Generated Module', version: String(module.version) },
  })

  _registered.add(module.id)
}

/**
 * Unregisters a generated module -- revokes blob URL and removes from tracking.
 * Note: Widget Registry has no unregister function; the widget entry remains
 * but won't appear in any layout so it won't render.
 */
export function unregisterGeneratedModule(moduleId: string): void {
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
export async function loadGeneratedModules(): Promise<void> {
  try {
    const data = await api.get<{ modules: WidgetModule[] }>('/api/generated-modules')
    for (const mod of data.modules) {
      if (mod.enabled) {
        registerGeneratedModule(mod)
      }
    }
  } catch (err) {
    console.warn('[generated-module-store] Failed to load modules:', err)
  }
}

/**
 * Creates a new module via the backend API and registers it in the widget registry.
 */
export async function saveGeneratedModule(data: {
  name: string
  description: string
  icon: string
  source: string
  configSchema: WidgetModule['configSchema']
  defaultSize: WidgetModule['defaultSize']
}): Promise<WidgetModule> {
  const result = await api.post<{ module: WidgetModule }>('/api/generated-modules', data)
  registerGeneratedModule(result.module)
  return result.module
}

/**
 * Updates an existing module via the backend API and re-registers with new source.
 */
export async function updateGeneratedModule(
  id: string,
  data: {
    source?: string
    configSchema?: WidgetModule['configSchema']
    name?: string
    description?: string
    icon?: string
  }
): Promise<WidgetModule> {
  const result = await api.put<{ module: WidgetModule }>('/api/generated-modules/' + id, data)
  registerGeneratedModule(result.module)
  return result.module
}

/**
 * Soft-deletes a module via the backend API and unregisters from widget registry.
 */
export async function deleteGeneratedModule(id: string): Promise<void> {
  await api.del('/api/generated-modules/' + id)
  unregisterGeneratedModule(id)
}

/**
 * Toggles a module's enabled state. Registers on enable, unregisters on disable.
 */
export async function toggleGeneratedModule(id: string, enabled: boolean): Promise<WidgetModule> {
  const result = await api.patch<{ module: WidgetModule }>(
    '/api/generated-modules/' + id + '/toggle',
    { enabled }
  )
  if (enabled) {
    registerGeneratedModule(result.module)
  } else {
    unregisterGeneratedModule(id)
  }
  return result.module
}

/**
 * Rolls back a module to a previous version and re-registers with old source.
 */
export async function rollbackGeneratedModule(id: string, version: number): Promise<WidgetModule> {
  const result = await api.post<{ module: WidgetModule }>(
    '/api/generated-modules/' + id + '/rollback',
    { version }
  )
  registerGeneratedModule(result.module)
  return result.module
}

/**
 * Fetches the version history for a module.
 */
export async function getGeneratedModuleVersions(id: string): Promise<WidgetModuleVersion[]> {
  const result = await api.get<{ versions: WidgetModuleVersion[] }>(
    '/api/generated-modules/' + id + '/versions'
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
  delete (window as any).__generatedModuleAPI
}
