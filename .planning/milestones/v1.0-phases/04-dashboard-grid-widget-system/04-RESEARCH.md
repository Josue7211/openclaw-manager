# Phase 4: Dashboard Grid + Widget System - Research

**Researched:** 2026-03-20
**Domain:** Dashboard grid layout, widget registry, drag-and-drop, layout persistence, edit mode UX
**Confidence:** HIGH

## Summary

Phase 4 transforms the existing static 3-column CSS grid dashboard into a free-form, user-customizable widget canvas powered by react-grid-layout v2. The phase covers five core subsystems: (1) the grid layout engine with drag/resize/snap, (2) a Widget Registry mapping IDs to lazy-loaded components, (3) edit mode with iOS-style wobble, widget picker, and undo, (4) multiple dashboard pages with tab navigation, and (5) layout persistence through the existing SQLite-to-Supabase offline-first sync engine.

The app uses React 19.2.4. The maintainer of react-grid-layout confirmed React 18+ compatibility in v2 (the v1 TypeScript issues were "Fixed in v2" per GitHub issue #2117, closed December 2025). The v2 API is a complete TypeScript rewrite with hooks (`useContainerWidth`, `useGridLayout`, `useResponsiveLayout`) replacing the legacy HOC/class patterns. A community fork (`react-grid-layout-19`) exists as a fallback if any runtime issue surfaces, but should not be needed.

The existing dashboard has 9 card components (8 data cards + DashboardHeader) in `pages/dashboard/`, all using `React.memo` and receiving data from a centralized `useDashboardData` hook. The rewrite decouples these cards into independent widgets that fetch their own data, while the hook's polling/SSE infrastructure remains available as shared context. Layout persistence follows the established pattern: localStorage for instant load, preferences-sync to Supabase for multi-device, and a new `widget_layouts` table in both SQLite and Supabase.

**Primary recommendation:** Install `react-grid-layout@2.2.2`, use the v2 `Responsive` component with `useContainerWidth` hook, build a `WidgetRegistry` manifest with `React.lazy` imports, and persist layouts per-breakpoint via the existing preferences-sync + sync.rs infrastructure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Auto-columns based on width:** Grid auto-calculates columns -- 4 on wide, 3 on default, 2 on compact, 1 on narrow
- **Widget sizing:** Preset sizes (S/M/L/XL like iOS) as starting points + free resize within grid cells after
- **Non-overlapping + z-order:** Widgets push each other out of the way when dragged. Separately, widgets can be pinned/floating above the grid (like sticky notes)
- **Compact breakpoint:** Separate compact layout definable by user, with option to enable auto-reflow instead (setting per widget or globally)
- **Scrollable dashboard:** Dashboard pages scroll vertically -- can be infinitely long
- **Widget headers:** Borderless cards by default, optional title header per widget (user toggle)
- **Multiple pages with a default "Home"** -- users create named tabs ("Home", "Work", "Monitoring")
- **Navigation:** Tabs at top, sidebar sub-items under "Dashboard", optional dot indicators (toggleable)
- **Full control:** Rename by double-clicking tab, reorder by drag-and-drop, delete pages
- **App title pinned at top** -- always visible above the dashboard tabs, like a Discord server name
- **Enter edit mode via:** Header button (pencil icon) + long-press on any widget starts iOS wobble mode + keyboard shortcut (Ctrl+E)
- **Option to disable wobble:** User can turn off wobble animation in Settings but keep hold-to-edit
- **Visual changes in edit mode:** Grid lines visible, widgets wobble/jiggle (toggleable), resize handles on corners/edges, remove (X) button on each widget corner
- **Add widget -- three ways:** (1) Floating '+' button opens widget picker panel, (2) Drag from widget library sidebar onto grid, (3) Click empty grid space to place widget where clicked
- **Recycle bin:** Bottom drawer showing recently removed widgets (drag back to restore) + Ctrl+Z undo stack for recent actions
- **Widget Picker Organization:** Categories (Monitoring, Productivity, AI, Media) + search bar + preview pane showing widget appearance before adding
- **Existing cards:** Each of 9 dashboard cards available as individual widgets AND as grouped bundles
- **Widget config:** Gear icon per widget (visible in edit mode or on hover) opening a config panel. Each widget type defines its own settings schema
- **Three-tier Widget Registry:** (1) Built-in widgets (shipped), (2) User widgets (future marketplace), (3) AI widgets (Phase 7 Bjorn)
- **Smart default + curated:** Auto-generate layout from enabled modules, but with curated arrangement
- **Reset:** Per-page and global "Reset to default layout" option
- **Layout storage:** Default auto-reflow + optional per-breakpoint custom layouts
- **Sync per Supabase account:** Each user's layouts saved per user_id, RLS-protected
- **SQLite local + Supabase sync** -- follows existing offline-first pattern (sync.rs)

### Claude's Discretion
- Exact column calculation formula at each breakpoint
- iOS wobble animation CSS implementation
- Widget picker panel layout and animation
- How preset sizes map to grid cells (S=1x1, M=2x1, etc.)
- Floating/pinned widget z-order management
- Default layout widget arrangement
- Dot indicator style and positioning

### Deferred Ideas (OUT OF SCOPE)
- Widget marketplace -- Download extensions, themes, widgets, modules, packs from GitHub
- Split layouts -- Split app into 2+ panes showing different pages/dashboards side by side
- Popout windows -- Detach a dashboard page or widget into its own OS window
- Module packs -- Modules bundled with widgets and themes as installable packages
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Free-form grid layout with drag-to-reposition and resize handles | react-grid-layout v2 `Responsive` component provides drag, resize, snap out of the box. `dragConfig.enabled` and `resizeConfig.enabled` control availability. |
| DASH-02 | Widgets snap to grid cells during drag/resize | react-grid-layout automatically snaps items to grid cells. Grid has configurable `cols`, `rowHeight`, and `margin`. No custom snap logic needed. |
| DASH-03 | Edit mode toggle (enter/exit via button and keyboard shortcut) | `isDraggable`/`isResizable` can be toggled via state. Edit mode state stored in a `useSyncExternalStore` pattern (matches sidebar-config.ts). Keyboard shortcut registered in LayoutShell's existing keybinding system. |
| DASH-04 | Edit mode shows grid lines, resize handles, add widget button, remove widget X | CSS class on grid container toggled by edit state. Grid lines via CSS `background-image: repeating-linear-gradient`. Resize handles and remove buttons rendered conditionally. |
| DASH-05 | Non-edit mode shows clean layout with no edit chrome | `dragConfig.enabled: false`, `resizeConfig.enabled: false` hides all interaction handles. CSS class removal hides grid lines. |
| DASH-06 | Add widget picker showing available widgets by category | Widget picker as a modal/panel reading from WidgetRegistry. Categories stored in widget metadata. Search via filtered list. |
| DASH-07 | Widget Registry mapping widget IDs to lazy-loaded React components | `WidgetRegistry` manifest: `Record<string, WidgetDefinition>` with `component: () => Promise<{default: ComponentType}>` for `React.lazy`. Three tiers: builtin, user, bjorn. |
| DASH-08 | Layout persisted to SQLite + synced to Supabase per breakpoint | New `widget_layouts` table in SQLite (migration 0009) and Supabase. Layouts stored as JSON per page per breakpoint. Sync via existing sync.rs engine + preferences-sync.ts. |
| DASH-09 | Default layout provided for first-time users (populated from enabled modules) | `generateDefaultLayout(enabledModules: string[])` function creates curated grid placement. Uses `modules.ts` `getEnabledModules()` to filter. |
| DASH-10 | Existing dashboard cards refactored as grid widgets | Each card gets a `WidgetDefinition` entry. Cards wrapped in error boundary + loading state. Data fetching moves from centralized `useDashboardData` to per-widget React Query hooks. |
| DASH-11 | Each widget has its own error boundary and loading state | `WidgetWrapper` component wraps each lazy-loaded widget with `PageErrorBoundary` (existing) + `Suspense` fallback showing `LoadingState` (existing from Phase 1). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-grid-layout` | 2.2.2 | Free-form drag/resize widget grid | De facto standard for React dashboard grids. 22K GitHub stars, 1.6M weekly npm downloads. v2 is a full TypeScript rewrite with hooks API. Maintainer confirmed React 18+ compatibility in v2. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | -- | All other needs covered by existing stack | React 19, React Query 5, Phosphor Icons, CSS variables, useSyncExternalStore |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-grid-layout | `gridstack.js` + wrapper | Not React-native, DOM manipulation conflicts with React virtual DOM. `@declarative-gridstack/react` has 366 weekly downloads vs 1.6M. |
| react-grid-layout | `dnd-kit` + custom grid | dnd-kit is a drag primitive, not a grid layout system. Would need to build resize, snap, responsive breakpoints, layout serialization from scratch. 2-3x more work. |
| react-grid-layout | Custom CSS Grid + drag handlers | Enormous effort to build collision detection, compaction, responsive breakpoints, and serialization. react-grid-layout is battle-tested. |

**Installation:**
```bash
cd frontend && npm install react-grid-layout
```

**CSS imports required:**
```typescript
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
```

**Estimated bundle impact:** ~40KB gzipped (react-grid-layout + react-resizable + react-draggable). Code-split into the dashboard chunk since it is only used on the dashboard page.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── lib/
│   ├── widget-registry.ts       # WidgetDefinition type, BUILTIN_WIDGETS manifest, registry lookup
│   ├── dashboard-store.ts       # useSyncExternalStore: edit mode, active page, layout state, undo stack
│   └── dashboard-defaults.ts    # Default layout generator from enabled modules
├── pages/
│   ├── Dashboard.tsx            # REWRITE: DashboardGrid orchestrator with tabs, edit mode, picker
│   └── dashboard/
│       ├── DashboardGrid.tsx    # Responsive grid layout using react-grid-layout v2
│       ├── DashboardTabs.tsx    # Tab bar for multiple dashboard pages
│       ├── WidgetWrapper.tsx    # Error boundary + Suspense wrapper per widget
│       ├── WidgetPicker.tsx     # Add widget panel with categories, search, preview
│       ├── WidgetConfig.tsx     # Per-widget settings gear panel
│       ├── EditModeControls.tsx # Edit/done button, Ctrl+E handler, recycle bin drawer
│       ├── DashboardHeader.tsx  # (existing, minor update for edit button)
│       ├── HeartbeatCard.tsx    # (existing, refactored to standalone widget)
│       ├── AgentsCard.tsx       # (existing, refactored to standalone widget)
│       ├── ... (other cards)    # Each existing card becomes a standalone widget
│       ├── types.ts             # (existing, extended with WidgetProps)
│       └── useDashboardData.ts  # (existing, kept as shared data provider)
├── components/
│   └── DashboardProvider.tsx    # Context providing dashboard store to all widgets
```

### Pattern 1: Widget Registry with Lazy Loading
**What:** Central manifest mapping widget IDs to lazy-loaded React components with metadata. Each widget is self-contained: it owns its data fetching, error handling, and responsive behavior.
**When to use:** Every widget rendered on the dashboard.
**Example:**
```typescript
// lib/widget-registry.ts
export interface WidgetDefinition {
  id: string
  name: string
  description: string
  icon: string                   // Phosphor icon name
  category: 'monitoring' | 'productivity' | 'ai' | 'media' | 'general'
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  maxSize?: { w: number; h: number }
  tier: 'builtin' | 'user' | 'bjorn'
  configSchema?: Record<string, unknown>  // Per-widget settings definition
  component: () => Promise<{ default: React.ComponentType<WidgetProps> }>
}

export interface WidgetProps {
  widgetId: string       // Instance ID on the grid
  isEditing: boolean     // Dashboard is in edit mode
}

export const BUILTIN_WIDGETS: WidgetDefinition[] = [
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    description: 'Agent heartbeat monitor',
    icon: 'Cpu',
    category: 'monitoring',
    defaultSize: { w: 4, h: 2 },
    minSize: { w: 2, h: 2 },
    tier: 'builtin',
    component: () => import('@/pages/dashboard/HeartbeatCard'),
  },
  // ... 8 more built-in widgets
]

const registry = new Map<string, WidgetDefinition>()
BUILTIN_WIDGETS.forEach(w => registry.set(w.id, w))

export function getWidget(id: string): WidgetDefinition | undefined {
  return registry.get(id)
}

export function getWidgetsByCategory(): Record<string, WidgetDefinition[]> {
  const grouped: Record<string, WidgetDefinition[]> = {}
  for (const w of registry.values()) {
    if (!grouped[w.category]) grouped[w.category] = []
    grouped[w.category].push(w)
  }
  return grouped
}
```

### Pattern 2: Dashboard Store with useSyncExternalStore
**What:** Reactive global state for dashboard: edit mode, active page, layouts per page, undo/redo stacks. Follows the exact same pattern as `sidebar-config.ts` and `theme-store.ts`.
**When to use:** All dashboard state that needs to be shared across DashboardGrid, EditModeControls, WidgetPicker, DashboardTabs, and the sidebar.
**Example:**
```typescript
// lib/dashboard-store.ts
export interface DashboardPage {
  id: string
  name: string
  layouts: Record<string, LayoutItem[]>  // Keyed by breakpoint: { lg: [...], md: [...], sm: [...], xs: [...] }
  widgets: string[]                       // Widget IDs present on this page
}

export interface DashboardState {
  pages: DashboardPage[]
  activePageId: string
  editMode: boolean
  wobbleEnabled: boolean
  removedWidgets: Array<{ widgetId: string; pageId: string; removedAt: number }>  // Recycle bin
}

// useSyncExternalStore pattern:
const _listeners = new Set<() => void>()
let _cached: DashboardState = loadFromLocalStorage()

export function getDashboardState(): DashboardState { return _cached }
export function subscribeDashboard(cb: () => void): () => void {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}
export function setDashboardState(next: DashboardState): void {
  pushUndo(_cached)
  _cached = next
  localStorage.setItem('dashboard-state', JSON.stringify(next))
  _listeners.forEach(fn => fn())
}
```

### Pattern 3: react-grid-layout v2 Responsive Integration
**What:** Use the v2 `Responsive` component with `useContainerWidth` hook to measure the grid container (not the viewport). Breakpoints keyed to content area width.
**When to use:** The main dashboard grid.
**Example:**
```typescript
// pages/dashboard/DashboardGrid.tsx
import { Responsive, useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const BREAKPOINTS = { lg: 1100, md: 800, sm: 500, xs: 0 }
const COLS = { lg: 12, md: 8, sm: 4, xs: 2 }
const ROW_HEIGHT = 80
const MARGIN: [number, number] = [16, 16]

function DashboardGrid({ page, editMode }: { page: DashboardPage; editMode: boolean }) {
  const { width, containerRef, mounted } = useContainerWidth()

  const handleLayoutChange = useCallback(
    debounce((currentLayout: Layout[], allLayouts: Layouts) => {
      // Save per-breakpoint layouts to dashboard store
      updatePageLayouts(page.id, allLayouts)
    }, 300),
    [page.id]
  )

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {mounted && (
        <Responsive
          layouts={page.layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          width={width}
          dragConfig={{ enabled: editMode }}
          resizeConfig={{ enabled: editMode }}
          onLayoutChange={handleLayoutChange}
          compactType="vertical"
        >
          {page.widgets.map(widgetId => (
            <div key={widgetId}>
              <WidgetWrapper widgetId={widgetId} isEditing={editMode} />
            </div>
          ))}
        </Responsive>
      )}
    </div>
  )
}
```

### Pattern 4: Widget Wrapper with Error Boundary
**What:** Each widget is wrapped in Suspense (for lazy loading) and an error boundary (for crash isolation). A crashed widget shows an error state without affecting other widgets.
**When to use:** Every widget on the grid.
**Example:**
```typescript
// pages/dashboard/WidgetWrapper.tsx
import React, { Suspense } from 'react'
import { getWidget } from '@/lib/widget-registry'
import PageErrorBoundary from '@/components/PageErrorBoundary'
import { LoadingState } from '@/components/ui/LoadingState'

const widgetCache = new Map<string, React.LazyExoticComponent<React.ComponentType<WidgetProps>>>()

function getOrCreateLazy(def: WidgetDefinition): React.LazyExoticComponent<...> {
  if (!widgetCache.has(def.id)) {
    widgetCache.set(def.id, React.lazy(def.component))
  }
  return widgetCache.get(def.id)!
}

export function WidgetWrapper({ widgetId, isEditing }: { widgetId: string; isEditing: boolean }) {
  const def = getWidget(widgetId)
  if (!def) return null

  const LazyWidget = getOrCreateLazy(def)

  return (
    <PageErrorBoundary>
      <Suspense fallback={<LoadingState />}>
        <LazyWidget widgetId={widgetId} isEditing={isEditing} />
      </Suspense>
    </PageErrorBoundary>
  )
}
```

### Pattern 5: Layout Persistence via Existing Sync Infrastructure
**What:** Dashboard layouts are stored in localStorage for instant load, and synced to Supabase via the existing `preferences-sync.ts` mechanism. The `widget_layouts` data is added to `SYNCED_KEYS`.
**When to use:** Every layout change (debounced).
**Architecture:**
- **localStorage key:** `dashboard-state` -- stores full `DashboardState` JSON
- **preferences-sync:** Add `'dashboard-state'` to `SYNCED_KEYS` array in `preferences-sync.ts`
- **Per-breakpoint storage:** Layouts stored as `{ lg: [...], md: [...], sm: [...], xs: [...] }` per page
- **Last-write-wins:** Same timestamp-based conflict resolution as existing preferences
- **Fallback:** If stored layout references widgets that no longer exist (module disabled), filter them out and fall back to auto-generated layout for those positions

### Anti-Patterns to Avoid
- **Viewport media queries for grid breakpoints:** The dashboard sits inside a resizable sidebar layout. Content area width is what matters, not window width. react-grid-layout's `useContainerWidth` correctly measures the container, not the viewport.
- **Single flat layout object for all breakpoints:** Store `{ lg: [...], md: [...] }` separately. Syncing a flat layout produces nonsensical results on different-sized monitors.
- **Centralized data fetching for all widgets:** The current `useDashboardData` hook fetches everything in one place. For the grid, each widget should independently use React Query so widgets can be added/removed without touching shared fetching logic. The hook can remain as an optimization for widgets that share the same data source.
- **Global re-render on drag:** Every pixel of drag triggers `onLayoutChange`. Widgets must be `React.memo`'d with comparators that ignore position changes. Only the grid container re-renders during drag.
- **Layout stored only in localStorage:** Must also sync to Supabase via existing infrastructure for multi-device support.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop grid | Custom drag handlers + CSS Grid + collision detection | `react-grid-layout` v2 | Collision detection, compaction, responsive breakpoints, and serialization are deceptively complex. RGL handles all of this. |
| Container width measurement | `window.innerWidth - sidebarWidth` calculation | `useContainerWidth()` from RGL v2 | Hook uses ResizeObserver on actual container. Handles sidebar resize, window resize, monitor switch automatically. |
| Responsive breakpoints | Manual `ResizeObserver` + state management | RGL `Responsive` component + `breakpoints` prop | RGL stores separate layouts per breakpoint and switches automatically. |
| Undo/redo for layout edits | Custom undo implementation | Undo stack pattern from `sidebar-config.ts` | Already proven pattern in this codebase. JSON-serialized state pushed to stack before each edit. Max 30 entries. |
| Widget error isolation | Custom try/catch wrappers | `PageErrorBoundary` (existing) + `React.Suspense` | Error boundaries are the React-native pattern. PageErrorBoundary already handles retry. |

**Key insight:** react-grid-layout v2 solves 80% of this phase's technical complexity (drag, resize, snap, responsive, compaction, serialization). The remaining 20% is widget registry, edit mode UX, and persistence plumbing -- all of which follow patterns already established in the codebase.

## Common Pitfalls

### Pitfall 1: Dashboard State Desync Across Devices
**What goes wrong:** Layout changes on one device don't properly sync to another, or syncing produces conflicting layouts because different monitors use different breakpoints.
**Why it happens:** Dashboard grid layouts are resolution-dependent. A layout designed for a 1440p monitor makes no sense on a 1080p laptop. Syncing "the layout" as a single object merges incompatible breakpoint data.
**How to avoid:** Store layouts per-breakpoint: `{ lg: [...], md: [...], sm: [...], xs: [...] }`. Each device applies the layout for its current breakpoint. Use last-write-wins with timestamps (same as existing preferences-sync).
**Warning signs:** Widgets piling up in top-left corner after sync (default RGL behavior when layout data is invalid -- documented in issues #902 and #1583).

### Pitfall 2: Re-render Avalanche During Drag
**What goes wrong:** Each widget re-renders on every pixel of drag movement because the layout object changes on every `onLayoutChange` callback. With 8-10 widgets containing live-updating data (10s/30s polling), each drag gesture triggers hundreds of re-renders.
**Why it happens:** react-grid-layout fires `onLayoutChange` continuously during drag. If widget components are not memoized, every child re-renders.
**How to avoid:** (1) `React.memo` every widget with a custom comparator that ignores layout position props. (2) Separate layout state from content state -- widgets receive content via independent React Query hooks, not layout-coupled props. (3) Debounce `onLayoutChange` for persistence (300ms). (4) Consider pausing data polling during active drag (set `isDragging` ref).
**Warning signs:** Resize handle lags 2-3x behind cursor. CPU usage spikes during drag.

### Pitfall 3: Responsive Breakpoints Miscalculated
**What goes wrong:** Dashboard breakpoints (`lg: 1200, md: 996`) never reach `lg` for the content area because the sidebar takes 260px+. Widgets meant for 3-4 columns render in 2-column layout, looking cramped.
**Why it happens:** Breakpoints are set relative to full window width but the content area is window minus sidebar.
**How to avoid:** `useContainerWidth()` measures the grid container, not the viewport -- this is correct. Set breakpoints relative to expected content area widths: `{ lg: 1100, md: 800, sm: 500, xs: 0 }`. Test with sidebar open (260px) and collapsed (64px) at 1080p, 1440p, and minimum 900px window.
**Warning signs:** Grid always in "compact" mode even on a wide monitor.

### Pitfall 4: react-grid-layout v2.2.0 Bug
**What goes wrong:** v2.2.0 has a critical layout bug acknowledged by the maintainer ("Do not use this release" in release notes). v2.2.1 and v2.2.2 fix it.
**Why it happens:** Upgrade dependency.
**How to avoid:** Pin to `react-grid-layout@2.2.2` exactly. Do not use `^2.2.0`.
**Warning signs:** Layouts resetting unexpectedly, items stacking.

### Pitfall 5: Layout Applied Before Widgets Mount
**What goes wrong:** If layout is applied before widget components exist in the DOM, react-grid-layout stacks all items in the top-left corner (coordinates 0,0).
**Why it happens:** Layout references widget IDs that haven't rendered yet.
**How to avoid:** Load layout from storage only after the `Responsive` component has mounted. Use `useContainerWidth`'s `mounted` flag to gate rendering. If stored layout references widgets that no longer exist, filter them out.
**Warning signs:** All widgets piled in top-left on page load, then "snap" to correct positions.

### Pitfall 6: Edit Mode Keyboard Shortcut Conflicts
**What goes wrong:** Ctrl+E conflicts with existing keybindings or browser defaults.
**Why it happens:** The existing keybinding system in `keybindings.ts` uses configurable shortcuts. Adding Ctrl+E without checking could conflict.
**How to avoid:** Register the dashboard edit mode shortcut through the existing `keybindings.ts` system so it can be user-customized. Check that Ctrl+E is not already bound (it currently is not based on existing bindings).
**Warning signs:** Pressing Ctrl+E triggers something unexpected.

## Code Examples

### Widget Size Presets (Claude's Discretion)
```typescript
// Preset sizes mapping to grid cells
// Based on 12-column grid with 80px row height
export const WIDGET_SIZES = {
  S:  { w: 3,  h: 2 },   // ~25% width, 160px tall
  M:  { w: 4,  h: 3 },   // ~33% width, 240px tall
  L:  { w: 6,  h: 4 },   // ~50% width, 320px tall
  XL: { w: 12, h: 4 },   // Full width, 320px tall
} as const

// Users pick a preset when adding, then free-resize from there
```

### Column Formula (Claude's Discretion)
```typescript
// Breakpoint -> column mapping
// Content area width, NOT window width (useContainerWidth measures container)
const BREAKPOINTS = { lg: 1100, md: 800, sm: 500, xs: 0 }
const COLS       = { lg: 12,   md: 8,   sm: 4,   xs: 2 }

// At 1920px window, 260px sidebar = 1660px content -> lg (12 cols)
// At 1920px window, 64px sidebar  = 1856px content -> lg (12 cols)
// At 1440px window, 260px sidebar = 1180px content -> lg (12 cols)
// At 1080px window, 260px sidebar = 820px content  -> md (8 cols)
// At  900px window, 260px sidebar = 640px content  -> sm (4 cols)
// At  900px window, 64px sidebar  = 836px content  -> md (8 cols)
```

### iOS Wobble Animation (Claude's Discretion)
```css
/* globals.css addition */
@keyframes widget-wobble {
  0%   { transform: rotate(0deg); }
  25%  { transform: rotate(-0.5deg); }
  50%  { transform: rotate(0.5deg); }
  75%  { transform: rotate(-0.3deg); }
  100% { transform: rotate(0deg); }
}

.widget-edit-mode {
  animation: widget-wobble 0.3s ease-in-out infinite alternate;
}

/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  .widget-edit-mode {
    animation: none;
  }
}

/* User-toggleable via class */
.widget-wobble-disabled .widget-edit-mode {
  animation: none;
}
```

### Default Layout Generator (Claude's Discretion)
```typescript
// lib/dashboard-defaults.ts
import { getEnabledModules } from './modules'
import { BUILTIN_WIDGETS, WidgetDefinition } from './widget-registry'

// Curated order: status first, then data, then auxiliary
const DEFAULT_ORDER = [
  'agent-status', 'heartbeat', 'agents',
  'missions', 'memory', 'idea-briefing',
  'network', 'sessions'
]

export function generateDefaultLayout(enabledModules?: string[]): {
  widgets: string[];
  layouts: Record<string, LayoutItem[]>;
} {
  const enabled = new Set(enabledModules ?? getEnabledModules())
  const widgets = DEFAULT_ORDER.filter(id => {
    const def = BUILTIN_WIDGETS.find(w => w.id === id)
    return def && enabled.has('dashboard') // Dashboard module must be enabled
  })

  // Place widgets in a curated 3-column arrangement
  const layout: LayoutItem[] = []
  let x = 0, y = 0
  for (const id of widgets) {
    const def = BUILTIN_WIDGETS.find(w => w.id === id)!
    const { w, h } = def.defaultSize
    if (x + w > 12) { x = 0; y += 3 } // Next row
    layout.push({ i: id, x, y, w, h })
    x += w
  }

  return {
    widgets,
    layouts: { lg: layout, md: layout, sm: layout, xs: layout },
  }
}
```

### Adding Dashboard State to Preferences Sync
```typescript
// In preferences-sync.ts, add to SYNCED_KEYS:
const SYNCED_KEYS = [
  'theme-state',
  'dnd-enabled',
  'system-notifs',
  'in-app-notifs',
  'notif-sound',
  'sidebar-width',
  'keybindings',
  'enabled-modules',
  'sidebar-config',
  'dashboard-state',  // NEW: dashboard layouts, pages, widget config
] as const
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `WidthProvider` HOC | `useContainerWidth()` hook | RGL v2 (Dec 2024) | Cleaner composition, better tree-shaking, no HOC wrapper |
| Class-based API | Hooks API (`useGridLayout`, `useResponsiveLayout`) | RGL v2 (Dec 2024) | TypeScript-native, works with modern React patterns |
| Flow types | TypeScript built-in | RGL v2 (Dec 2024) | No `@types/react-grid-layout` needed |
| `isDraggable`/`isResizable` props | `dragConfig`/`resizeConfig` objects | RGL v2 (Dec 2024) | More granular control (handle, cancel, bounded) |
| `compactType` string | `compactor` function prop | RGL v2.1 (2025) | Pluggable compaction algorithms |

**Deprecated/outdated:**
- `WidthProvider` HOC: Still available for backward compatibility but `useContainerWidth` is the v2-recommended pattern
- `@types/react-grid-layout`: Not needed with v2 (ships its own TypeScript definitions)
- react-grid-layout v2.2.0: Critical layout bug. Use v2.2.1 or v2.2.2.

## Open Questions

1. **React 19 runtime compatibility**
   - What we know: Maintainer confirmed "Fixed in v2" for React 18+ TypeScript issues. v2 requires React 18+. React 19 is newer but API-compatible.
   - What's unclear: Whether there are any subtle runtime issues with React 19's concurrent features + RGL's drag handlers. The `react-grid-layout-19` fork exists but may address issues already fixed in v2.2.2.
   - Recommendation: Install v2.2.2 and test immediately. If drag/resize crashes on React 19, fall back to `react-grid-layout-19` fork. Risk: LOW -- v2 was designed for modern React.

2. **Floating/pinned widgets above the grid**
   - What we know: User wants widgets that can be "pinned/floating above the grid (like sticky notes)."
   - What's unclear: react-grid-layout does not natively support floating widgets outside the grid. This would need a separate layer (absolutely positioned elements with their own drag logic).
   - Recommendation: Implement as a stretch goal after the core grid works. Use a separate "floating layer" div with basic drag (could use dnd-kit for just the floating widgets). Store floating widget positions separately from grid layouts.

3. **Drag from widget library sidebar onto grid**
   - What we know: One of the three "add widget" methods. RGL v2 supports external drop via the droppingItem feature.
   - What's unclear: Exact API for external drag-and-drop in v2 (the v2 docs are still being filled in).
   - Recommendation: Start with the "+' button and click-to-place methods. Add drag-from-library as an enhancement using RGL's `onDrop` callback.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Grid renders widgets at specified positions | unit | `cd frontend && npx vitest run src/pages/dashboard/__tests__/DashboardGrid.test.tsx -x` | Wave 0 |
| DASH-02 | Layout items snap to grid (w/h are integers, x+w <= cols) | unit | `cd frontend && npx vitest run src/lib/__tests__/widget-registry.test.ts -x` | Wave 0 |
| DASH-03 | Edit mode toggles dragConfig/resizeConfig | unit | `cd frontend && npx vitest run src/lib/__tests__/dashboard-store.test.ts -x` | Wave 0 |
| DASH-04 | Edit mode class applied, grid lines visible | unit | `cd frontend && npx vitest run src/pages/dashboard/__tests__/EditModeControls.test.tsx -x` | Wave 0 |
| DASH-05 | Non-edit mode: no resize handles, no remove buttons | unit | `cd frontend && npx vitest run src/pages/dashboard/__tests__/DashboardGrid.test.tsx -x` | Wave 0 |
| DASH-06 | Widget picker shows categories and search | unit | `cd frontend && npx vitest run src/pages/dashboard/__tests__/WidgetPicker.test.tsx -x` | Wave 0 |
| DASH-07 | Registry resolves widget IDs to components | unit | `cd frontend && npx vitest run src/lib/__tests__/widget-registry.test.ts -x` | Wave 0 |
| DASH-08 | Layout serializes to JSON, loads from localStorage | unit | `cd frontend && npx vitest run src/lib/__tests__/dashboard-store.test.ts -x` | Wave 0 |
| DASH-09 | Default layout generated from enabled modules | unit | `cd frontend && npx vitest run src/lib/__tests__/dashboard-defaults.test.ts -x` | Wave 0 |
| DASH-10 | Existing cards render inside WidgetWrapper | unit | `cd frontend && npx vitest run src/pages/dashboard/__tests__/WidgetWrapper.test.tsx -x` | Wave 0 |
| DASH-11 | Widget error boundary catches and shows ErrorState | unit | `cd frontend && npx vitest run src/pages/dashboard/__tests__/WidgetWrapper.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/lib/__tests__/widget-registry.test.ts` -- covers DASH-02, DASH-07
- [ ] `frontend/src/lib/__tests__/dashboard-store.test.ts` -- covers DASH-03, DASH-08
- [ ] `frontend/src/lib/__tests__/dashboard-defaults.test.ts` -- covers DASH-09
- [ ] `frontend/src/pages/dashboard/__tests__/DashboardGrid.test.tsx` -- covers DASH-01, DASH-05
- [ ] `frontend/src/pages/dashboard/__tests__/WidgetWrapper.test.tsx` -- covers DASH-10, DASH-11
- [ ] `frontend/src/pages/dashboard/__tests__/WidgetPicker.test.tsx` -- covers DASH-06
- [ ] `frontend/src/pages/dashboard/__tests__/EditModeControls.test.tsx` -- covers DASH-04
- [ ] Framework install: `cd frontend && npm install react-grid-layout` -- react-grid-layout not yet in package.json

## Sources

### Primary (HIGH confidence)
- [react-grid-layout GitHub](https://github.com/react-grid-layout/react-grid-layout) -- v2 TypeScript rewrite, hooks API, responsive breakpoints
- [react-grid-layout npm](https://www.npmjs.com/package/react-grid-layout) -- v2.2.2, 1.6M weekly downloads
- [react-grid-layout releases](https://github.com/react-grid-layout/react-grid-layout/releases) -- v2.2.2 (Dec 30 2025), v2.2.0 critical bug warning
- [react-grid-layout issue #2117](https://github.com/react-grid-layout/react-grid-layout/issues/2117) -- React 18/19 compat confirmed "Fixed in v2" by maintainer
- [react-grid-layout README](https://github.com/react-grid-layout/react-grid-layout/blob/master/README.md) -- v2 API: useContainerWidth, dragConfig, resizeConfig, Responsive component
- Existing codebase: `Dashboard.tsx`, `useDashboardData.ts`, 9 card components, `preferences-sync.ts`, `sidebar-config.ts` (undo pattern), `modules.ts`, `sync.rs`, `LayoutShell.tsx`

### Secondary (MEDIUM confidence)
- [react-grid-layout-19 fork](https://github.com/Censkh/react-grid-layout-19) -- Fallback for React 19 compat issues (likely not needed with v2.2.2)
- [ilert: Why React-Grid-Layout](https://www.ilert.com/blog/building-interactive-dashboards-why-react-grid-layout-was-our-best-choice) -- Real-world RGL case study
- `.planning/research/STACK.md` -- Project stack research recommending react-grid-layout v2
- `.planning/research/ARCHITECTURE.md` -- Widget Registry pattern, build order
- `.planning/research/PITFALLS.md` -- Dashboard state sync race condition (#4), re-render avalanche (#6), responsive breakpoint miscalculation (#10)

### Tertiary (LOW confidence)
- v2 hooks API details (`useGridLayout`, `useResponsiveLayout` parameters) -- v2 docs are still sparse. `useContainerWidth` is well-documented, but the other two hooks have limited documentation. WebFetch extracted partial info; may need to read RGL source during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- react-grid-layout v2.2.2 is the clear choice, maintainer confirmed React 18+ compat, 1.6M weekly downloads
- Architecture: HIGH -- Widget Registry, dashboard store, and persistence patterns all follow established codebase conventions (useSyncExternalStore, preferences-sync, sidebar-config undo stacks)
- Pitfalls: HIGH -- Pitfalls #4 (sync), #6 (re-renders), #10 (breakpoints) are well-documented in RGL issue tracker and project research

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- react-grid-layout v2 is mature, no breaking changes expected)
