# Phase 6: Module Primitives Library - Research

**Researched:** 2026-03-20
**Domain:** React UI primitives, SVG charting, widget system integration, schema-driven configuration
**Confidence:** HIGH

## Summary

Phase 6 builds 11 distinct UI primitives (stat card, line chart, bar chart, list view, table, form, kanban board, progress/gauge, markdown display, timer/countdown, image gallery) plus 3 cross-cutting requirements (config schemas, widget compatibility, internal error handling). Each primitive is a standalone React component that integrates with the existing Widget Registry from Phase 4 via `registerWidget()`.

The existing codebase provides strong foundations: `WidgetProps` and `WidgetConfigSchema` types are already defined, `WidgetWrapper` provides error boundary + Suspense + lazy loading, `WidgetConfigPanel` renders schema-driven config UIs automatically, and `EmptyState`/`ErrorState` components exist for reuse. The project already uses `marked` v17.0.4 for markdown rendering, `DOMPurify` for sanitization, native HTML5 Drag and Drop API (no library) for all drag interactions, `@phosphor-icons/react` for icons, and CSS variables exclusively for theming.

**Primary recommendation:** Build primitives as pure render components in `components/primitives/`, each co-exporting a `configSchema` alongside the component, registered in the Widget Registry with category `'custom'` (or a new `'primitives'` category). Use custom SVG for charts (no charting library), native HTML5 DnD for kanban, and the existing `marked` + `DOMPurify` stack for markdown. Every primitive wraps its content with an inline error catch and delegates loading state to the parent `WidgetWrapper`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Chart Rendering:** Lightweight SVG-based charts -- no heavy charting library (Recharts, Chart.js, etc.). Custom SVG components for line chart and bar chart. Bjorn can generate SVG markup directly. Sparklines in stat cards use inline SVG paths. Tooltip positioning via CSS transform, not a portal.
- **Primitive API Contract:** Every primitive implements `WidgetProps` from `widget-registry.ts`: `{ widgetId, config, isEditMode, size }`. Config is `Record<string, unknown>` -- primitives validate against their own `WidgetConfigSchema`. Each primitive exports a `configSchema: WidgetConfigSchema` alongside the component. Primitives are pure render components -- they receive data via config, not internal fetching. Data fetching happens in the widget wrapper or parent, not inside the primitive.
- **Config Schema Design:** Flat JSON schemas matching the existing `WidgetConfigSchema` type from Phase 4. Field types: `text`, `number`, `toggle`, `select`, `slider` (already defined). Each primitive's schema documents every configurable property with defaults. Schema doubles as documentation -- Bjorn reads schemas to understand what primitives accept. VS Code-inspired: schema drives the config panel UI automatically.
- **Internal State Management:** Each primitive wraps itself with error boundary (catch + fallback UI). Empty state handled via conditional render -- no data shows EmptyState from `components/ui/`. Loading state is the parent's responsibility (Suspense boundary in WidgetWrapper). Primitives never crash -- malformed config renders a helpful error message, not a blank widget.
- **Modularity (VS Code-inspired):** Each primitive is a standalone file in `components/primitives/`. Primitives are registered in the Widget Registry via `registerWidget()` -- same as built-in widgets. Each primitive can be lazy-loaded independently. Config schema is co-located with the component (exported from the same file). Future: Bjorn generates new primitives that follow the same contract and register themselves.
- **Theme Compliance:** All colors via CSS variables -- `var(--text-primary)`, `var(--accent)`, `var(--border)`, etc. Chart colors use the accent/secondary/tertiary color hierarchy from the theme engine. No hardcoded colors, font sizes, or spacing values. Dark/light mode handled automatically by CSS variables -- primitives don't check theme mode.

### Claude's Discretion
- Exact SVG chart implementation details (axis labels, grid lines, animation)
- Kanban board drag library choice (or custom implementation)
- Markdown renderer choice (marked, remark, or custom)
- Timer/countdown internal state approach
- Image gallery grid layout algorithm
- Exact empty state illustrations per primitive

### Deferred Ideas (OUT OF SCOPE)
- Real-time data streaming into primitives (WebSocket-fed charts) -- future enhancement
- Composite primitives (chart + table in one) -- after basic primitives proven
- Animation/transition framework for primitives -- could be Phase 6.1 if needed
- Primitive marketplace / sharing -- v2 milestone
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRIM-01 | Stat card primitive (title, value, trend indicator, sparkline) | Custom SVG sparkline via inline `<svg><path>`, trend indicator via arrow icon + color. Config schema: title, value, unit, trend direction, sparkline data points, color accent. |
| PRIM-02 | Line chart primitive (time series, configurable axes, tooltip) | Custom SVG `<polyline>` or `<path>` for the line, `<text>` for axis labels, CSS transform tooltip. Config: data points array, x/y labels, line color, show grid, show dots. |
| PRIM-03 | Bar chart primitive (vertical/horizontal, grouped, stacked) | Custom SVG `<rect>` elements with computed positions. Config: orientation, bar data, categories, colors, stacked toggle. |
| PRIM-04 | List view primitive (sortable, filterable, paginated) | Pure React component with `useState` for sort/filter/page. Config: items array, columns, page size, searchable toggle. |
| PRIM-05 | Table primitive (sortable columns, row actions, pagination) | Pure React `<table>` with sticky header, sortable column headers, action buttons per row. Config: columns definition, data rows, page size, show actions. |
| PRIM-06 | Form primitive (text, number, select, toggle, date -- schema-driven) | Reuses the `WidgetConfigSchema` field type pattern from `WidgetConfigPanel`. Config: form fields schema, submit label. |
| PRIM-07 | Kanban board primitive (columns, drag between columns) | Native HTML5 Drag and Drop API (project pattern -- see SettingsModules.tsx). Config: columns array, items per column, column colors. |
| PRIM-08 | Progress bar / gauge primitive | Enhance existing `ProgressBar` from `components/ui/`. Add circular gauge variant. Config: value, max, label, variant (bar/circular/gauge), color. |
| PRIM-09 | Markdown display primitive (render markdown content) | Use existing `marked` v17.0.4 + `DOMPurify` via `sanitizeHtml()` from `lib/sanitize.ts`. Config: markdown content, max height, show scrollbar. |
| PRIM-10 | Timer / countdown primitive | `useRef` + `requestAnimationFrame` or `setInterval` for tick. Config: duration seconds, direction (up/down), auto-start, show milliseconds. |
| PRIM-11 | Image gallery primitive (grid, lightbox on click) | CSS Grid layout, reuse existing `Lightbox.tsx` for fullscreen view. Config: images array (src + alt), columns count, gap size, aspect ratio. |
| PRIM-12 | Each primitive has a documented config schema (JSON) | Every primitive co-exports `configSchema: WidgetConfigSchema`. Schema fields use the 5 existing types: text, number, toggle, select, slider. |
| PRIM-13 | Each primitive is widget-compatible (renders inside dashboard grid) | Every primitive registered via `registerWidget()` with appropriate defaultSize, minSize, and category. Works inside `WidgetWrapper` which provides error boundary + Suspense. |
| PRIM-14 | Each primitive handles loading, error, and empty states internally | Inline try-catch wrapper renders `ErrorState` on crash. Empty config/data renders `EmptyState`. Loading delegated to parent Suspense. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | Component framework | Already installed, project standard |
| TypeScript | ~5.9.3 | Type safety | Already installed, project standard |
| @phosphor-icons/react | ^2.1.10 | Icons for primitives | Already installed, project icon library |
| marked | 17.0.4 | Markdown rendering (PRIM-09) | Already installed and used in MarkdownBubble.tsx |
| dompurify | 3.3.3 | HTML sanitization (PRIM-09) | Already installed, sanitizeHtml() utility exists |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-grid-layout | 2.2.2 | Dashboard grid (host for primitives) | Already installed -- primitives render inside this grid |
| @tanstack/react-query | ^5.90.21 | Data fetching (parent level) | Already installed -- parents fetch data, pass to primitives via config |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom SVG charts | Recharts / Victory / visx | User decision: custom SVG keeps bundle small, Bjorn can generate SVG directly. Heavy libraries add 50-200KB. |
| Native HTML5 DnD (kanban) | @dnd-kit/core / @hello-pangea/dnd | Native DnD is the project pattern (SettingsModules.tsx uses it extensively). Adding a library would be inconsistent. |
| marked (markdown) | remark / markdown-it | marked is already installed and used in MarkdownBubble.tsx. No reason to add another renderer. |

**Installation:**
```bash
# No new dependencies needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── components/
│   ├── primitives/           # NEW: All 11 primitive components
│   │   ├── StatCard.tsx       # PRIM-01
│   │   ├── LineChart.tsx      # PRIM-02
│   │   ├── BarChart.tsx       # PRIM-03
│   │   ├── ListView.tsx       # PRIM-04
│   │   ├── DataTable.tsx      # PRIM-05
│   │   ├── FormWidget.tsx     # PRIM-06
│   │   ├── KanbanBoard.tsx    # PRIM-07
│   │   ├── ProgressGauge.tsx  # PRIM-08
│   │   ├── MarkdownDisplay.tsx # PRIM-09
│   │   ├── TimerCountdown.tsx # PRIM-10
│   │   ├── ImageGallery.tsx   # PRIM-11
│   │   ├── shared.tsx         # Shared helpers (config validation, inline error wrapper)
│   │   ├── register.ts        # Bulk registerWidget() calls for all primitives
│   │   └── __tests__/         # Test files for each primitive
│   ├── ui/
│   │   ├── EmptyState.tsx     # Reused by primitives (existing)
│   │   ├── ErrorState.tsx     # Reused by primitives (existing)
│   │   └── ProgressBar.tsx    # Enhanced for PRIM-08 (existing)
│   └── dashboard/
│       └── WidgetWrapper.tsx  # Hosts primitives (existing, no changes needed)
├── lib/
│   ├── widget-registry.ts     # Extended with primitive registrations (existing)
│   └── sanitize.ts            # Reused for markdown (existing)
```

### Pattern 1: Primitive Component Contract
**What:** Every primitive follows the same API signature and co-exports its config schema.
**When to use:** Every single primitive file.
**Example:**
```typescript
// Source: widget-registry.ts WidgetProps interface + CONTEXT.md decisions
import React from 'react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { EmptyState } from '@/components/ui/EmptyState'
import { ChartLine } from '@phosphor-icons/react'

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: 'Line Chart' },
    { key: 'showGrid', label: 'Show grid lines', type: 'toggle', default: true },
    { key: 'lineColor', label: 'Line color', type: 'select', default: 'accent',
      options: [
        { label: 'Accent', value: 'accent' },
        { label: 'Secondary', value: 'secondary' },
        { label: 'Tertiary', value: 'tertiary' },
      ] },
  ],
}

const LineChart = React.memo(function LineChart({ widgetId, config, isEditMode, size }: WidgetProps) {
  // Validate and extract config with defaults
  const title = String(config.title ?? configSchema.fields[0].default)
  const data = Array.isArray(config.data) ? config.data as number[] : []

  if (data.length === 0) {
    return <EmptyState icon={ChartLine} title="No data" description="Provide data points to display the chart." />
  }

  // Render SVG chart...
  return (
    <div style={{ width: '100%', height: '100%', padding: '16px' }}>
      <svg viewBox={`0 0 ${size.w * 100} ${size.h * 80}`} style={{ width: '100%', height: '100%' }}>
        {/* Chart rendering */}
      </svg>
    </div>
  )
})

export default LineChart
```

### Pattern 2: Inline Error Wrapper
**What:** A lightweight error catch wrapper that each primitive uses internally, distinct from the parent `WidgetWrapper` error boundary. The parent catches component crashes; this catches config/data issues gracefully.
**When to use:** Inside every primitive for malformed config defense.
**Example:**
```typescript
// Source: CONTEXT.md "Primitives never crash -- malformed config renders a helpful error"
function safeConfigArray(config: Record<string, unknown>, key: string): unknown[] {
  const val = config[key]
  if (Array.isArray(val)) return val
  return []
}

function safeConfigString(config: Record<string, unknown>, key: string, fallback: string): string {
  const val = config[key]
  return typeof val === 'string' ? val : fallback
}

function safeConfigNumber(config: Record<string, unknown>, key: string, fallback: number): number {
  const val = config[key]
  return typeof val === 'number' && !isNaN(val) ? val : fallback
}
```

### Pattern 3: Widget Registration
**What:** Centralized registration file that calls `registerWidget()` for all primitives.
**When to use:** Called once at app startup (imported in main entry point).
**Example:**
```typescript
// Source: widget-registry.ts registerWidget() API
import { registerWidget } from '@/lib/widget-registry'

export function registerPrimitives(): void {
  registerWidget({
    id: 'prim-stat-card',
    name: 'Stat Card',
    description: 'Key metric with trend indicator and sparkline',
    icon: 'ChartLineUp',
    category: 'custom',
    tier: 'builtin',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    component: () => import('@/components/primitives/StatCard'),
  })
  // ... register remaining primitives
}
```

### Pattern 4: SVG Chart Color Resolution
**What:** Map color config values to CSS variable references for theme compliance.
**When to use:** In chart primitives (StatCard sparkline, LineChart, BarChart).
**Example:**
```typescript
// Source: globals.css color variable hierarchy
const COLOR_MAP: Record<string, string> = {
  accent: 'var(--accent)',
  'accent-dim': 'var(--accent-dim)',
  secondary: 'var(--secondary)',
  'secondary-dim': 'var(--secondary-dim)',
  tertiary: 'var(--tertiary)',
  'tertiary-dim': 'var(--tertiary-dim)',
  red: 'var(--red)',
  amber: 'var(--amber)',
}

function resolveColor(key: string): string {
  return COLOR_MAP[key] ?? 'var(--accent)'
}
```

### Anti-Patterns to Avoid
- **Fetching data inside primitives:** Primitives are pure render components. The parent (or a data provider at the dashboard level) fetches data and passes it via `config`. This keeps primitives testable and Bjorn-friendly.
- **Using React Error Boundaries inside primitives:** The parent `WidgetWrapper` already provides `PageErrorBoundary`. Primitives should use defensive config parsing (type guards + fallbacks), not additional error boundaries. The parent catches unrecoverable crashes.
- **Hardcoding pixel values for responsive sizing:** Primitives receive `size: { w, h }` (grid units, not pixels). Use percentage-based or viewBox-based SVG sizing. The grid cell dimensions are determined by `ROW_HEIGHT` (80px) and column width.
- **Creating portals for tooltips:** CONTEXT.md specifies tooltip positioning via CSS transform, not portals. Portals can escape the widget boundary and cause z-index issues in the dashboard grid.
- **Adding new npm dependencies:** Everything needed is already installed. Custom SVG (not Recharts), native DnD (not dnd-kit), existing marked (not remark).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom markdown parser | `marked` v17.0.4 (already installed) | Markdown parsing has hundreds of edge cases (nested lists, code blocks, tables, GFM extensions). marked handles them all. |
| HTML sanitization | Custom sanitizer | `DOMPurify` via `sanitizeHtml()` from `lib/sanitize.ts` | XSS prevention is security-critical. DOMPurify is battle-tested. The existing utility already has the right allowlist configured. |
| Error boundaries | Custom class component error boundary | `PageErrorBoundary` in `WidgetWrapper` | Already wraps every widget. Don't duplicate. |
| Config panel UI | Custom settings dialog per primitive | `WidgetConfigPanel` reads `configSchema` automatically | The schema-driven config panel from Phase 4 already iterates fields and renders appropriate controls (toggle, slider, select, text, number). |
| Image lightbox viewer | Custom fullscreen image viewer | `Lightbox.tsx` component (already exists) | Handles zoom, keyboard navigation, focus trapping, escape-to-close. |
| Widget lazy loading | Custom dynamic import management | `WidgetWrapper` lazy cache via `React.lazy` | Already provides singleton caching, Suspense fallback, and skeleton shimmer. |

**Key insight:** The Phase 4 widget system already solved most infrastructure problems. Primitives are essentially content components that plug into the existing registry, wrapper, and config panel system. The work is building the visual components, not the plumbing.

## Common Pitfalls

### Pitfall 1: Widget Instance ID vs Registry ID Mismatch
**What goes wrong:** The `DashboardGrid` currently passes `pluginId={item.i}` where `item.i` is the grid layout item ID. For default layouts, this equals the registry widget ID (e.g., `heartbeat`). But when widgets are added via WidgetPicker, the instance ID is `{widgetDef.id}-{uuid}` (e.g., `prim-stat-card-a1b2c3d4`). The `getWidget(pluginId)` call in `WidgetWrapper` will return `undefined` for instance IDs.
**Why it happens:** The current built-in widgets are singletons (one instance each), so `item.i` always matches the registry ID. But primitives will have multiple instances on the same dashboard.
**How to avoid:** Either: (a) fix `DashboardGrid` to extract the base widget type from instance IDs (split on first `-` that precedes a UUID pattern), or (b) store the pluginId separately in the layout item metadata, or (c) store it in `widgetConfigs` alongside the instance config. Option (a) is simplest and aligns with the existing `WidgetPicker` pattern of `${widgetDef.id}-${uuid.slice(0,8)}`.
**Warning signs:** Widgets render as blank/null after being added from the WidgetPicker.

### Pitfall 2: SVG viewBox Sizing in Variable-Size Grid Cells
**What goes wrong:** Chart primitives render with wrong proportions or get clipped because the SVG `viewBox` doesn't account for the actual rendered pixel dimensions.
**Why it happens:** Primitives receive `size: { w, h }` in grid units (columns, rows), not pixels. The actual pixel size depends on container width, `ROW_HEIGHT` (80px), margins (16px), and the current breakpoint column count.
**How to avoid:** Use percentage-based sizing (`width: 100%; height: 100%`) and let SVG `viewBox` define the coordinate space. Use `preserveAspectRatio="none"` or calculate aspect ratio from `w/h` grid units. Alternatively, use a `ResizeObserver` to get actual pixel dimensions.
**Warning signs:** Charts look squished, stretched, or have dead space in certain grid sizes.

### Pitfall 3: Memory Leaks in Timer/Countdown Primitive
**What goes wrong:** Timer primitive leaks `setInterval` or `requestAnimationFrame` callbacks when the widget is removed from the dashboard or the page is navigated away.
**Why it happens:** Timer state is managed via `setInterval`/`requestAnimationFrame` which must be cleaned up in `useEffect` return functions.
**How to avoid:** Always use `useEffect` cleanup. Use `useRef` for the interval/animation frame ID. Clear on unmount. Consider pausing when the widget is not visible (Intersection Observer or dashboard tab switching).
**Warning signs:** CPU usage increases over time; multiple timer callbacks firing after widget removal.

### Pitfall 4: Kanban Drag Ghost Image on Linux/WebKitGTK
**What goes wrong:** The HTML5 drag ghost image (the semi-transparent preview shown during drag) looks broken on WebKitGTK (Tauri's Linux renderer) -- it may be blank, wrong-sized, or have rendering artifacts.
**Why it happens:** WebKitGTK's HTML5 DnD implementation has known quirks with ghost images, especially for complex DOM nodes.
**How to avoid:** Keep dragged card DOM simple (minimal nesting, no complex CSS like backdrop-filter). Use `e.dataTransfer.setDragImage()` with a pre-rendered simple element if the default ghost is broken. Test on Linux (the primary platform).
**Warning signs:** Drag operation starts but no visual feedback; ghost image is a white rectangle or flickers.

### Pitfall 5: Markdown XSS via Config Injection
**What goes wrong:** Markdown content passed via widget config could contain malicious HTML/JS if the config source is untrusted (future: Bjorn-generated configs).
**Why it happens:** `marked` converts markdown to HTML which can contain script tags or event handlers without sanitization.
**How to avoid:** Always pipe through `sanitizeHtml()` from `lib/sanitize.ts` (which uses DOMPurify with a strict allowlist). Never render raw HTML from config without sanitization. This is already the pattern in `MarkdownBubble.tsx`.
**Warning signs:** `<script>` tags or `onclick` handlers in rendered markdown output.

### Pitfall 6: Config Schema Type Limitation
**What goes wrong:** Some primitives need config types beyond the 5 currently supported (text, number, toggle, select, slider) -- for example, arrays of data points for charts, or nested objects for kanban columns.
**Why it happens:** `WidgetConfigSchema` was designed for simple settings. Complex data structures (arrays, objects) don't map to existing field types.
**How to avoid:** Complex data (chart data points, kanban items, table rows) should be passed via the `config` record as opaque `Record<string, unknown>` values, not through the schema-driven config panel. The config panel handles user-facing settings (title, colors, toggles). Actual data comes from the parent/data provider. Document this separation clearly.
**Warning signs:** Trying to represent arrays as comma-separated text fields; schema fields becoming unusable for complex types.

## Code Examples

Verified patterns from the existing codebase:

### SVG Sparkline (for StatCard PRIM-01)
```typescript
// Custom SVG sparkline -- no library needed
// Source: Project decision (CONTEXT.md: "Sparklines in stat cards use inline SVG paths")
function Sparkline({ data, color = 'var(--accent)', width = 100, height = 30 }: {
  data: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: `${height}px` }}
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}
```

### Markdown Rendering (for MarkdownDisplay PRIM-09)
```typescript
// Source: existing MarkdownBubble.tsx + lib/sanitize.ts
import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import { useMemo } from 'react'

marked.use({ gfm: true, breaks: true })

function renderMarkdown(content: string): string {
  return sanitizeHtml(marked.parse(content) as string)
}
```

### Native HTML5 DnD (for KanbanBoard PRIM-07)
```typescript
// Source: SettingsModules.tsx InterCategoryDropZone pattern
// Project uses native HTML5 DnD exclusively -- no library

function handleDragStart(e: React.DragEvent, cardId: string) {
  e.dataTransfer.setData('text/plain', cardId)
  e.dataTransfer.effectAllowed = 'move'
}

function handleDragOver(e: React.DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
}

function handleDrop(e: React.DragEvent, targetColumnId: string) {
  e.preventDefault()
  e.stopPropagation()
  const cardId = e.dataTransfer.getData('text/plain')
  if (!cardId) return
  // Move card to target column
}
```

### Widget Registration (for register.ts)
```typescript
// Source: widget-registry.ts registerWidget() API
import { registerWidget } from '@/lib/widget-registry'

export function registerPrimitives(): void {
  registerWidget({
    id: 'prim-stat-card',
    name: 'Stat Card',
    description: 'Key metric with trend indicator and sparkline',
    icon: 'ChartLineUp',
    category: 'custom',
    tier: 'builtin',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    component: () => import('@/components/primitives/StatCard'),
  })
  // ... register remaining primitives
}
```

### Config-Safe Extraction (for shared.tsx)
```typescript
// Defensive config parsing -- primitives never crash on bad config
export function configString(config: Record<string, unknown>, key: string, fallback: string): string {
  const v = config[key]
  return typeof v === 'string' ? v : fallback
}

export function configNumber(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function configBool(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = config[key]
  return typeof v === 'boolean' ? v : fallback
}

export function configArray<T>(config: Record<string, unknown>, key: string): T[] {
  const v = config[key]
  return Array.isArray(v) ? v as T[] : []
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Canvas-based charts (Chart.js) | SVG-based (custom or visx) | 2023-2024 | SVG is more accessible (DOM nodes), theme-able via CSS, and Bjorn can generate SVG markup directly |
| External DnD libraries (react-beautiful-dnd) | Native HTML5 DnD or @dnd-kit | 2023 (react-beautiful-dnd deprecated) | react-beautiful-dnd deprecated in favor of @hello-pangea/dnd fork. But native DnD is lighter and what this project uses. |
| marked v4-12 | marked v17 | 2025 | v17 uses `marked.use({ renderer: { code({text, lang}) {} } })` instead of `marked.setOptions()`. GFM and breaks configured via `marked.use()`. |
| React 18 patterns | React 19 patterns | 2024-2025 | React 19 is installed. `use()` hook available but not required. `React.memo` still the primary optimization pattern in this codebase. |

**Deprecated/outdated:**
- react-beautiful-dnd: Deprecated, use @hello-pangea/dnd or native DnD. This project uses native DnD.
- marked.setOptions(): Replaced by marked.use() in v17+.

## Open Questions

1. **Widget Instance ID Resolution**
   - What we know: `DashboardGrid` passes `pluginId={item.i}` where `item.i` is the layout item ID. For WidgetPicker-added widgets, this is `{defId}-{uuid}`, which doesn't match registry keys.
   - What's unclear: Whether this is already handled somewhere not yet found, or is a gap.
   - Recommendation: Fix in DashboardGrid by extracting base plugin ID from instance ID. Simplest approach: `const pluginId = item.i.includes('-') ? item.i.replace(/-[a-f0-9]{8}$/, '') : item.i` -- but this assumes the UUID suffix pattern. A cleaner approach: store `pluginId` in the `widgetConfigs` record.

2. **Widget Category for Primitives**
   - What we know: Current categories are `'monitoring' | 'productivity' | 'ai' | 'media' | 'custom'`. WidgetPicker has labels and ordering for these 5.
   - What's unclear: Should primitives use `'custom'` or a new `'primitives'` category?
   - Recommendation: Add a `'primitives'` category to the union type and to `CATEGORY_LABELS`/`CATEGORY_ORDER` in WidgetPicker. This separates user-facing primitives from AI-generated custom widgets.

3. **Data Passing Strategy for Complex Primitives**
   - What we know: Config is `Record<string, unknown>`. Config panel handles simple types (text, number, toggle, select, slider). Charts need arrays of data points, tables need row arrays.
   - What's unclear: How Bjorn or users will supply complex data to primitives at runtime (Phase 7 concern, but architecture affects Phase 6).
   - Recommendation: Design primitives to accept complex data via config keys (e.g., `config.data`, `config.rows`, `config.columns`) that are opaque to the config panel. The config panel only controls user-facing settings. Complex data is injected programmatically by Bjorn or by data provider wrappers.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + @testing-library/react 16.3.2 |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run src/components/primitives` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRIM-01 | StatCard renders title, value, trend, sparkline | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/StatCard.test.tsx -x` | Wave 0 |
| PRIM-02 | LineChart renders SVG with data points | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/LineChart.test.tsx -x` | Wave 0 |
| PRIM-03 | BarChart renders vertical/horizontal bars | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/BarChart.test.tsx -x` | Wave 0 |
| PRIM-04 | ListView sorts, filters, paginates | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/ListView.test.tsx -x` | Wave 0 |
| PRIM-05 | DataTable renders sortable columns + pagination | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/DataTable.test.tsx -x` | Wave 0 |
| PRIM-06 | FormWidget renders schema-driven fields | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/FormWidget.test.tsx -x` | Wave 0 |
| PRIM-07 | KanbanBoard drag between columns | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/KanbanBoard.test.tsx -x` | Wave 0 |
| PRIM-08 | ProgressGauge renders bar and circular variants | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/ProgressGauge.test.tsx -x` | Wave 0 |
| PRIM-09 | MarkdownDisplay renders sanitized markdown | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/MarkdownDisplay.test.tsx -x` | Wave 0 |
| PRIM-10 | TimerCountdown counts up/down with cleanup | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/TimerCountdown.test.tsx -x` | Wave 0 |
| PRIM-11 | ImageGallery renders grid + lightbox | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/ImageGallery.test.tsx -x` | Wave 0 |
| PRIM-12 | All primitives export configSchema | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/schemas.test.ts -x` | Wave 0 |
| PRIM-13 | All primitives registerable + render in WidgetWrapper | integration | `cd frontend && npx vitest run src/components/primitives/__tests__/integration.test.tsx -x` | Wave 0 |
| PRIM-14 | All primitives handle empty/error config gracefully | unit | `cd frontend && npx vitest run src/components/primitives/__tests__/error-handling.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/components/primitives`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/primitives/__tests__/` directory -- does not exist yet
- [ ] All 14 test files listed above -- none exist
- [ ] `frontend/src/components/primitives/shared.tsx` -- config helpers needed by all primitives
- [ ] `frontend/src/components/primitives/register.ts` -- centralized widget registration

## Sources

### Primary (HIGH confidence)
- `frontend/src/lib/widget-registry.ts` -- WidgetProps, WidgetConfigSchema, WidgetDefinition types, registerWidget() API, BUILTIN_WIDGETS pattern
- `frontend/src/components/dashboard/WidgetWrapper.tsx` -- Error boundary + Suspense + lazy loading wrapper
- `frontend/src/components/dashboard/WidgetConfigPanel.tsx` -- Schema-driven config rendering for all 5 field types
- `frontend/src/lib/dashboard-store.ts` -- Dashboard state management, layout persistence, widgetConfigs
- `frontend/src/lib/dashboard-defaults.ts` -- Default layout generation pattern
- `frontend/src/pages/dashboard/DashboardGrid.tsx` -- Grid rendering, widget-to-WidgetWrapper mapping
- `frontend/src/components/dashboard/WidgetPicker.tsx` -- Widget instance ID generation pattern
- `frontend/src/components/MarkdownBubble.tsx` -- Existing marked + DOMPurify pattern
- `frontend/src/lib/sanitize.ts` -- DOMPurify configuration with strict allowlist
- `frontend/src/pages/settings/SettingsModules.tsx` -- Native HTML5 DnD pattern used across the project
- `frontend/src/components/ui/EmptyState.tsx` -- Reusable empty state component
- `frontend/src/components/ui/ErrorState.tsx` -- Reusable error state component
- `frontend/src/components/Lightbox.tsx` -- Image viewer with zoom for ImageGallery
- `frontend/src/globals.css` -- CSS variable definitions for theming

### Secondary (MEDIUM confidence)
- [marked v17 official docs](https://marked.js.org/) -- marked.use() API, GFM configuration
- [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout) -- Grid layout system hosting the primitives

### Tertiary (LOW confidence)
- Web search results on SVG chart patterns -- general patterns, verified against codebase constraints
- Web search results on HTML5 DnD kanban patterns -- aligned with existing project pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use in the codebase
- Architecture: HIGH -- widget system from Phase 4 is well-documented and inspected
- Pitfalls: HIGH -- identified from direct codebase analysis (instance ID mismatch, SVG sizing, timer cleanup, WebKitGTK DnD quirks, XSS, schema limitations)
- Config schema design: HIGH -- existing WidgetConfigSchema type and WidgetConfigPanel rendering logic fully analyzed
- Chart SVG patterns: MEDIUM -- custom SVG approach verified as feasible from codebase constraints, but exact implementation details are discretionary

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- no dependency changes expected)
