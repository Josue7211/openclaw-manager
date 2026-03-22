/**
 * Dashboard Default Layout Generator
 *
 * Produces a curated widget grid arrangement from the set of enabled modules.
 * Used on first launch and when the user resets a page to defaults.
 *
 * The layout is generated per breakpoint so every screen size has a hand-tuned
 * arrangement (not just auto-reflowed from a single source).
 */

import { getEnabledModules } from './modules'
import { BUILTIN_WIDGETS } from './widget-registry'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayoutItem {
  i: string   // widget ID
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export interface DefaultLayoutResult {
  widgets: string[]
  layouts: Record<string, LayoutItem[]>
}

// ---------------------------------------------------------------------------
// Default curated order (matches UI-SPEC default layout)
// ---------------------------------------------------------------------------

export const DEFAULT_ORDER: string[] = [
  'agent-status',
  'heartbeat',
  'network',
  'agents',
  'sessions',
  'missions',
  'memory',
  'idea-briefing',
]

// ---------------------------------------------------------------------------
// Layout generator
// ---------------------------------------------------------------------------

/**
 * Generate a default dashboard layout from the set of enabled modules.
 *
 * All 8 built-in widgets are always included (they gracefully handle missing
 * services), so the `enabledModuleIds` parameter is reserved for future
 * filtering of third-party widgets tied to specific modules.
 */
export function generateDefaultLayout(enabledModuleIds?: string[]): DefaultLayoutResult {
  const enabled = enabledModuleIds ?? getEnabledModules()

  // Build a lookup of widget definitions keyed by ID
  const widgetMap = new Map(BUILTIN_WIDGETS.map(w => [w.id, w]))

  // Filter to DEFAULT_ORDER widgets that exist in the registry
  // All built-in widgets are included since they handle missing services gracefully
  const widgetIds = DEFAULT_ORDER.filter(id => {
    const def = widgetMap.get(id)
    if (!def) return false
    // Keep all built-in widgets regardless of enabled modules
    // (they show helpful empty states when their service is unavailable)
    return true
  })

  // Ensure we didn't filter down to nothing when modules are limited
  // but dashboard itself is available
  void enabled

  const widgets = [...widgetIds]

  // Generate layouts per breakpoint (must match DashboardGrid BREAKPOINTS: xl, lg, md, sm)
  const lg = generateLgLayout(widgetIds, widgetMap)
  const md = generateMdLayout(widgetIds, widgetMap)
  const sm = generateSmLayout(widgetIds, widgetMap)

  return {
    widgets,
    layouts: { xl: lg, lg, md, sm },
  }
}

// ---------------------------------------------------------------------------
// Per-breakpoint layout generators
// ---------------------------------------------------------------------------

function getMinSize(id: string, widgetMap: Map<string, { minSize?: { w: number; h: number } }>): { minW?: number; minH?: number } {
  const def = widgetMap.get(id)
  if (!def?.minSize) return {}
  return { minW: def.minSize.w, minH: def.minSize.h }
}

/**
 * Large: 12-column grid (displays as ~3 visual columns)
 *
 * Row 0: agent-status(4x2)  heartbeat(4x2)    network(4x2)
 * Row 2: agents(8x3)                           sessions(4x2)
 * Row 5: missions(8x3)                         memory(4x2)
 * Row 8: idea-briefing(8x2)
 */
function generateLgLayout(
  widgetIds: string[],
  widgetMap: Map<string, { minSize?: { w: number; h: number } }>
): LayoutItem[] {
  const placements: Record<string, Omit<LayoutItem, 'minW' | 'minH'>> = {
    'agent-status':  { i: 'agent-status',  x: 0, y: 0, w: 4, h: 2 },
    'heartbeat':     { i: 'heartbeat',     x: 4, y: 0, w: 4, h: 2 },
    'network':       { i: 'network',       x: 8, y: 0, w: 4, h: 2 },
    'agents':        { i: 'agents',        x: 0, y: 2, w: 8, h: 3 },
    'sessions':      { i: 'sessions',      x: 8, y: 2, w: 4, h: 2 },
    'missions':      { i: 'missions',      x: 0, y: 5, w: 8, h: 3 },
    'memory':        { i: 'memory',        x: 8, y: 5, w: 4, h: 2 },
    'idea-briefing': { i: 'idea-briefing', x: 0, y: 8, w: 8, h: 2 },
  }

  return widgetIds
    .filter(id => placements[id])
    .map(id => ({ ...placements[id], ...getMinSize(id, widgetMap) }))
}

/**
 * Medium: 8-column grid (displays as ~2 visual columns)
 *
 * Row 0: agent-status(4x2) heartbeat(4x2)
 * Row 2: network(4x2)      sessions(4x2)
 * Row 4: agents(8x3)
 * Row 7: missions(8x3)
 * Row 10: memory(4x2)       idea-briefing(4x2)
 */
function generateMdLayout(
  widgetIds: string[],
  widgetMap: Map<string, { minSize?: { w: number; h: number } }>
): LayoutItem[] {
  const placements: Record<string, Omit<LayoutItem, 'minW' | 'minH'>> = {
    'agent-status':  { i: 'agent-status',  x: 0, y: 0, w: 4, h: 2 },
    'heartbeat':     { i: 'heartbeat',     x: 4, y: 0, w: 4, h: 2 },
    'network':       { i: 'network',       x: 0, y: 2, w: 4, h: 2 },
    'sessions':      { i: 'sessions',      x: 4, y: 2, w: 4, h: 2 },
    'agents':        { i: 'agents',        x: 0, y: 4, w: 8, h: 3 },
    'missions':      { i: 'missions',      x: 0, y: 7, w: 8, h: 3 },
    'memory':        { i: 'memory',        x: 0, y: 10, w: 4, h: 2 },
    'idea-briefing': { i: 'idea-briefing', x: 4, y: 10, w: 4, h: 2 },
  }

  return widgetIds
    .filter(id => placements[id])
    .map(id => ({ ...placements[id], ...getMinSize(id, widgetMap) }))
}

/**
 * Small: 4-column grid (single column visual)
 * Stack everything vertically, full width.
 */
function generateSmLayout(
  widgetIds: string[],
  widgetMap: Map<string, { minSize?: { w: number; h: number } }>
): LayoutItem[] {
  let y = 0
  return widgetIds.map(id => {
    const def = BUILTIN_WIDGETS.find(w => w.id === id)
    const h = def?.defaultSize.h ?? 2
    const item: LayoutItem = {
      i: id,
      x: 0,
      y,
      w: 4,
      h,
      ...getMinSize(id, widgetMap),
    }
    y += h
    return item
  })
}

/**
 * Extra small: 4-column grid, everything stacked vertically (same as sm).
 */
function generateXsLayout(
  widgetIds: string[],
  widgetMap: Map<string, { minSize?: { w: number; h: number } }>
): LayoutItem[] {
  // Same as sm — full-width stacking
  return generateSmLayout(widgetIds, widgetMap)
}
