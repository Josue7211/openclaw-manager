# Phase 6: Module Primitives Library - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A comprehensive set of tested, themed, widget-compatible UI primitives that both users and Bjorn can compose modules from. 14 primitives total, each with a JSON config schema, widget compatibility, internal error handling, and theme compliance.

This phase creates the building blocks. Bjorn (Phase 7) composes them. Users can also use them directly as dashboard widgets.

</domain>

<decisions>
## Implementation Decisions

### Chart Rendering
- Lightweight SVG-based charts — no heavy charting library (Recharts, Chart.js, etc.)
- Custom SVG components for line chart and bar chart — keeps bundle small
- Bjorn can generate SVG markup directly, which is impossible with canvas-based libraries
- Sparklines in stat cards use inline SVG paths
- Tooltip positioning via CSS transform, not a portal

### Primitive API Contract
- Every primitive implements `WidgetProps` from `widget-registry.ts`: `{ widgetId, config, isEditMode, size }`
- Config is `Record<string, unknown>` — primitives validate against their own `WidgetConfigSchema`
- Each primitive exports a `configSchema: WidgetConfigSchema` alongside the component
- Primitives are pure render components — they receive data via config, not internal fetching
- Data fetching happens in the widget wrapper or parent, not inside the primitive

### Config Schema Design
- Flat JSON schemas matching the existing `WidgetConfigSchema` type from Phase 4
- Field types: `text`, `number`, `toggle`, `select`, `slider` (already defined)
- Each primitive's schema documents every configurable property with defaults
- Schema doubles as documentation — Bjorn reads schemas to understand what primitives accept
- VS Code-inspired: schema drives the config panel UI automatically (like VS Code's contributes.configuration)

### Internal State Management
- Each primitive wraps itself with error boundary (catch + fallback UI)
- Empty state handled via conditional render — no data shows EmptyState from `components/ui/`
- Loading state is the parent's responsibility (Suspense boundary in WidgetWrapper)
- Primitives never crash — malformed config renders a helpful error message, not a blank widget

### Modularity (VS Code-inspired)
- Each primitive is a standalone file in `components/primitives/`
- Primitives are registered in the Widget Registry via `registerWidget()` — same as built-in widgets
- Each primitive can be lazy-loaded independently
- Config schema is co-located with the component (exported from the same file)
- Future: Bjorn generates new primitives that follow the same contract and register themselves

### Theme Compliance
- All colors via CSS variables — `var(--text-primary)`, `var(--accent)`, `var(--border)`, etc.
- Chart colors use the accent/secondary/tertiary color hierarchy from the theme engine
- No hardcoded colors, font sizes, or spacing values
- Dark/light mode handled automatically by CSS variables — primitives don't check theme mode

### Claude's Discretion
- Exact SVG chart implementation details (axis labels, grid lines, animation)
- Kanban board drag library choice (or custom implementation)
- Markdown renderer choice (marked, remark, or custom)
- Timer/countdown internal state approach
- Image gallery grid layout algorithm
- Exact empty state illustrations per primitive

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Widget System (Phase 4)
- `frontend/src/lib/widget-registry.ts` — WidgetProps, WidgetConfigSchema, WidgetDefinition interfaces, registerWidget() API
- `frontend/src/lib/dashboard-store.ts` — Dashboard state management, layout persistence
- `frontend/src/components/dashboard/WidgetWrapper.tsx` — Error boundary + lazy loading wrapper

### Existing UI Primitives
- `frontend/src/components/ui/Button.tsx` — Button component pattern
- `frontend/src/components/ui/EmptyState.tsx` — Empty state component (reuse for primitive empty states)
- `frontend/src/components/ui/ErrorState.tsx` — Error state component (reuse for primitive error states)
- `frontend/src/components/ui/ProgressBar.tsx` — Existing progress bar (may need enhancement for PRIM-08)

### Theme System
- `frontend/src/globals.css` — CSS variables, color tokens, spacing tokens
- `frontend/src/lib/theme-definitions.ts` — Theme color maps (primitives must use these variables)

### VS Code Extensibility Patterns (inspiration)
- VS Code Webview API: iframe isolation + postMessage for extension views
- VS Code contributes.configuration: JSON Schema drives settings UI automatically
- Apply to: config schema design, widget isolation model, primitive registration pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/EmptyState.tsx`: Generic empty state — reuse in all primitives
- `components/ui/ErrorState.tsx`: Generic error state — reuse in all primitives
- `components/ui/ProgressBar.tsx`: Existing progress bar — enhance for gauge/progress primitive
- `components/Lightbox.tsx`: Image viewer with zoom — reuse for image gallery lightbox
- `lib/widget-registry.ts`: WidgetProps + WidgetConfigSchema types already defined
- `components/dashboard/WidgetWrapper.tsx`: Error boundary + Suspense wrapper

### Established Patterns
- `useSyncExternalStore` for reactive state (sidebar-config, theme-store, dashboard-store)
- CSS variables for all theming — no hardcoded colors anywhere
- Lazy loading via `React.lazy()` for code splitting
- `React.memo` on frequently-rendered components

### Integration Points
- Widget Registry: `registerWidget()` to add each primitive as a dashboard widget
- Dashboard Grid: Primitives render inside `WidgetWrapper` which provides error boundary
- Config Panel: `WidgetConfigPanel` reads `configSchema` from registry to render controls
- Widget Picker: Primitives appear in the picker's categorized list

</code_context>

<specifics>
## Specific Ideas

- VS Code's modular extension system as inspiration — each primitive is like a mini-extension with a manifest (configSchema), isolation (error boundary), and registration (registerWidget)
- Primitives should feel like Lego blocks — composable, predictable, self-contained
- Chart primitives should be simple enough that Bjorn can understand and generate them (SVG, not canvas)

</specifics>

<deferred>
## Deferred Ideas

- Real-time data streaming into primitives (WebSocket-fed charts) — future enhancement
- Composite primitives (chart + table in one) — after basic primitives proven
- Animation/transition framework for primitives — could be Phase 6.1 if needed
- Primitive marketplace / sharing — v2 milestone

</deferred>

---

*Phase: 06-module-primitives-library*
*Context gathered: 2026-03-20*
