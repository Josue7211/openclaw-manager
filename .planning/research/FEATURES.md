# Feature Landscape: Widget-First Architecture

**Domain:** Widget-based desktop dashboard with module-to-widget conversion
**Researched:** 2026-03-22

## Table Stakes

Features that must work for the widget-first architecture to be viable. Missing any of these = the conversion is incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Independent widget data fetching | Widgets crash without Dashboard parent today | Medium | Replace DashboardDataContext with per-widget React Query hooks |
| Size-responsive widget rendering | Widgets must look good at 2x2 AND 12x999 | Medium | Use `size` prop from WidgetProps, not explicit mode prop |
| Widget registration for all modules | Users expect to find every module in the Widget Picker | Low | Follow existing registerWidget() pattern from primitives/register.ts |
| Working edit mode (drag/resize) | Currently broken -- blocks all widget customization | Medium | react-grid-layout interaction bugs from v1.0 |
| Working config panels | Gear icon opens/positions correctly | Low-Med | Transform context bug from react-grid-layout |
| Personal page as widget grid | Home page must use same system as Dashboard | Medium | Replace static Personal.tsx with DashboardGrid |
| Widget Picker shows all module widgets | Users need to find and add new widgets | Low | Expand existing WidgetPicker with new category filters |
| Production-mode editing | Edit mode must work in release builds, not just dev | Low | Already architecturally supported, just bugfixed |
| Lazy-loaded widget components | No regression on initial load time | Low | Follow existing React.lazy pattern |
| Widget "View all" link to full page | Compact widgets must link to full experience | Low | Simple navigation button in footer |

## Differentiators

Features that set this apart from a basic widget dashboard. Not expected for v0.0.2 launch, but highly valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Category presets | One-click "Notes Workspace" or "Monitoring" layouts | Medium | Preset definition + Picker integration |
| Multi-widget module decomposition | Notes as graph + recent + editor independently | High | Complex modules need careful decomposition |
| Widget config schemas for module widgets | Per-instance settings (show completed todos, max items, etc.) | Medium | WidgetConfigSchema already exists, just needs per-widget definitions |
| Widget bundles for related widgets | "Add all monitoring widgets" one-click | Low | WidgetBundle type already exists in registry |
| Cross-page widget deduplication | Same widget on two pages shares data fetching | Free | React Query handles this automatically |
| Preset sharing via codes | Share dashboard layouts like theme share codes | Medium | Serialize DashboardPage to shareable JSON |
| Widget-level theme overrides | Different accent color per widget | Medium | Already have page/category overrides in theme system |

## Anti-Features

Features to explicitly NOT build during this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full Messages experience as widget | 800-line page with SSE, compose, drag-drop cannot fit in a grid cell | Summary widget with recent conversations + link to page |
| Full Chat experience as widget | WebSocket connection, model switching, long threads | Quick-reply widget + link to page |
| Full Notes editor as widget | CouchDB sync, wikilinks, file tree navigation | Notes-recent list widget + notes-graph widget |
| Custom widget layout editor (CSS) | Over-engineering for v0.0.2 | Size-responsive rendering via WidgetProps.size |
| Widget marketplace / sharing | No infrastructure for this | Bjorn AI builds custom widgets locally |
| Real-time widget collaboration | No multi-user support yet | Single-user localStorage persistence |
| Widget animations/transitions | Polish that delays core architecture work | Standard CSS transitions from globals.css |
| Nested widget grids | Grid inside a widget cell | Flat grid only -- complexity explosion with nesting |

## Feature Dependencies

```
Fix edit mode bugs
  --> Decouple existing cards (needs working edit to verify)
    --> Tier 1 module widgets (pattern proven)
      --> Personal page unification (needs Tier 1 widgets for Home layout)
        --> Tier 2 module widgets (pattern proven, Home page works)
          --> Category presets (needs all widgets registered)

Widget Picker enhancements (category filtering)
  --> Runs parallel with Tier 1 conversion

Tier 3 summary widgets
  --> Independent of most other work (just needs the kernel hook pattern)
```

## MVP Recommendation

Prioritize for v0.0.2:

1. **Fix edit mode bugs** -- unblocks everything
2. **Decouple existing 8 dashboard cards** -- proves the pattern, zero new UI
3. **Convert Tier 1 modules** (Todos, Calendar, Reminders) -- most user-visible value
4. **Unify Personal + Dashboard** -- core architectural win
5. **One category preset** (Monitoring) -- demonstrates the preset concept

Defer:
- **Tier 3 summary widgets** (Messages, Chat, Agents): Low ROI, these pages work fine as full-screen routes
- **Widget config schemas for all module widgets**: Can ship with sensible defaults and add config later
- **Preset sharing codes**: Nice-to-have after presets themselves work
- **Widget-level theme overrides**: Can piggyback on existing page-level overrides

## Sources

- Direct codebase analysis of all 17 module pages, widget registry, dashboard components
- v1.0 post-ship bug list (memory/project_v1_postship_bugs.md)
- PROJECT.md v0.0.2 target features
