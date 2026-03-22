/**
 * Home Dashboard Default Layout Generator
 *
 * Produces the default widget arrangement for the Home page. Includes
 * personal productivity widgets: Todos, Calendar, Reminders, Pomodoro,
 * Knowledge, Missions, Memory.
 */

import type { LayoutItem } from './dashboard-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HomeDefaultLayoutResult {
  layouts: Record<string, LayoutItem[]>
  widgetConfigs: Record<string, Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Home-specific default order
// ---------------------------------------------------------------------------

export const HOME_DEFAULT_ORDER: string[] = [
  'todos',
  'calendar',
  'reminders',
  'pomodoro',
  'knowledge',
  'missions',
  'memory',
]

// ---------------------------------------------------------------------------
// Layout generator
// ---------------------------------------------------------------------------

export function generateHomeDefaultLayout(): HomeDefaultLayoutResult {
  const lg = generateLgLayout()
  const md = generateMdLayout()
  const sm = generateSmLayout()

  // Build widgetConfigs with _pluginId for each widget
  const widgetConfigs: Record<string, Record<string, unknown>> = {}
  for (const id of HOME_DEFAULT_ORDER) {
    const instanceId = `${id}-home`
    widgetConfigs[instanceId] = { _pluginId: id }
  }

  return {
    layouts: { xl: lg, lg, md, sm },
    widgetConfigs,
  }
}

// ---------------------------------------------------------------------------
// Per-breakpoint layout generators
// ---------------------------------------------------------------------------

/**
 * Large/XL: 12-column grid
 *
 * Row 0: todos(4x3)       calendar(4x3)      reminders(4x3)
 * Row 3: pomodoro(2x2)    knowledge(4x2)     missions(3x2)    memory(3x2)
 */
function generateLgLayout(): LayoutItem[] {
  return [
    { i: 'todos-home',      x: 0, y: 0, w: 4, h: 3, minW: 1, minH: 2 },
    { i: 'calendar-home',   x: 4, y: 0, w: 4, h: 3, minW: 1, minH: 2 },
    { i: 'reminders-home',  x: 8, y: 0, w: 4, h: 3, minW: 1, minH: 2 },
    { i: 'pomodoro-home',   x: 0, y: 3, w: 2, h: 2, minW: 1, minH: 2 },
    { i: 'knowledge-home',  x: 2, y: 3, w: 4, h: 2, minW: 1, minH: 2 },
    { i: 'missions-home',   x: 6, y: 3, w: 3, h: 2, minW: 2, minH: 2 },
    { i: 'memory-home',     x: 9, y: 3, w: 3, h: 2, minW: 1, minH: 2 },
  ]
}

/**
 * Medium: 8-column grid
 *
 * Row 0: todos(4x3)        calendar(4x3)
 * Row 3: reminders(4x3)    pomodoro(4x2)
 * Row 6: knowledge(4x2)    missions(4x2)
 * Row 8: memory(4x2)
 */
function generateMdLayout(): LayoutItem[] {
  return [
    { i: 'todos-home',      x: 0, y: 0, w: 4, h: 3, minW: 1, minH: 2 },
    { i: 'calendar-home',   x: 4, y: 0, w: 4, h: 3, minW: 1, minH: 2 },
    { i: 'reminders-home',  x: 0, y: 3, w: 4, h: 3, minW: 1, minH: 2 },
    { i: 'pomodoro-home',   x: 4, y: 3, w: 4, h: 2, minW: 1, minH: 2 },
    { i: 'knowledge-home',  x: 0, y: 6, w: 4, h: 2, minW: 1, minH: 2 },
    { i: 'missions-home',   x: 4, y: 6, w: 4, h: 2, minW: 2, minH: 2 },
    { i: 'memory-home',     x: 0, y: 8, w: 4, h: 2, minW: 1, minH: 2 },
  ]
}

/**
 * Small: 4-column grid (single column visual)
 * Stack everything vertically, full width.
 */
function generateSmLayout(): LayoutItem[] {
  const items: Array<{ id: string; h: number }> = [
    { id: 'todos-home',     h: 3 },
    { id: 'calendar-home',  h: 3 },
    { id: 'reminders-home', h: 3 },
    { id: 'pomodoro-home',  h: 2 },
    { id: 'knowledge-home', h: 2 },
    { id: 'missions-home',  h: 2 },
    { id: 'memory-home',    h: 2 },
  ]

  let y = 0
  return items.map(({ id, h }) => {
    const item: LayoutItem = { i: id, x: 0, y, w: 4, h, minW: 1, minH: 2 }
    y += h
    return item
  })
}
