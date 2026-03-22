# Technology Stack

**Project:** OpenClaw Manager v0.0.2 -- Widget-First Architecture
**Researched:** 2026-03-22

## Recommended Stack

No new dependencies required. The existing stack handles the widget-first conversion entirely.

### Core Framework (Unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 18 | UI rendering | Locked in. 74k LOC TypeScript codebase. |
| TypeScript | 5.x | Type safety | Locked in. WidgetProps interface is the core contract. |
| Vite | 5.x | Bundler / dev server | Locked in. Lazy imports for widget code splitting work out of the box. |
| Tauri v2 | 2.x | Desktop shell + Rust backend | Locked in. No widget changes touch the Rust layer. |

### Data Layer (Unchanged, Central to Architecture)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TanStack React Query | 5.x | Server state + cache + deduplication | Core to the architecture. Query deduplication means independent widget data fetching shares network requests automatically. |
| Supabase JS Client | 2.x | Database access | Existing integration. Realtime subscriptions invalidate React Query caches. |

### Dashboard Grid (Unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| react-grid-layout | 1.4.x | Responsive drag-and-drop grid | Already in production. Supports breakpoints, resize, drag. Bugs are interaction-level, not architectural. |
| react-resizable | 3.x | Resize handles (peer dep of react-grid-layout) | Required peer dependency. |

### State Management (Unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| useSyncExternalStore | React built-in | Client state (sidebar config, dashboard store, modules, keybindings) | Already the pattern for all reactive stores. Dashboard store manages pages, layouts, widget configs. |
| localStorage | Browser API | Persistence layer | All stores persist to localStorage. No new persistence needs for widget conversion. |

### Routing (Unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Router | 6.x | Page routes | Routes remain. Pages still exist as full-page experiences. Widget conversion does not remove routes. |

### UI Components (Unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Phosphor Icons | React | Iconography | Already used by all widgets and pages. |
| CSS Variables | globals.css | Theming | No new CSS framework. Widget styling uses existing variables. |

## What Is NOT Needed

| Technology | Why Not |
|-----------|---------|
| Zustand / Jotai / Redux | useSyncExternalStore + React Query already handle all state patterns |
| CSS-in-JS (styled-components, emotion) | Inline styles + CSS variables is the established pattern |
| Container queries (CSS) | WidgetProps.size provides explicit dimensions -- no need for CSS introspection |
| Framer Motion | Existing CSS transitions + keyframes are sufficient for widgets |
| react-dnd | react-grid-layout handles all drag-and-drop for widgets |
| Additional charting library | SVG primitives (LineChart, BarChart) already registered |
| State machine library (XState) | Edit mode is a simple boolean, not a complex state machine |

## Key Technical Decisions

### React Query Deduplication (Critical)

The entire architecture relies on React Query's deduplication behavior:
- Multiple components calling `useQuery({ queryKey: ['missions'] })` share ONE network request
- `staleTime: 30_000` (from global QueryClient config) means data is reused for 30 seconds
- `refetchInterval` is also deduplicated -- only one timer per query key
- Widget A on page 1 and Widget B on page 2 using the same queryKey = one fetch

This is what makes independent widget data fetching work without the monolithic context.

### React.lazy Code Splitting (Critical)

Widget registration uses lazy component loading:
```typescript
component: () => import('./widgets/todos/TodosWidget')
```
Vite creates a separate chunk per widget. Only widgets placed on the current dashboard page are loaded. The existing `WidgetWrapper` handles Suspense boundaries.

### useSyncExternalStore for Dashboard State (Critical)

The `dashboard-store.ts` pattern provides:
- Multi-page dashboard state (pages, layouts per breakpoint, widget configs)
- Undo/redo for layout changes
- Recycle bin for removed widgets
- localStorage persistence
- Reactive updates (all consumers re-render on state change)

This pattern handles the Personal page unification -- just add a "Home" page to the pages array.

## Installation

No new packages needed:

```bash
# Existing deps handle everything
cd frontend && npm install  # already done
```

## Sources

- `frontend/package.json` (existing dependencies)
- `frontend/src/main.tsx` (QueryClient configuration with staleTime: 30_000)
- TanStack React Query docs: query deduplication is a documented core feature (HIGH confidence)
- react-grid-layout docs: responsive breakpoints, isDraggable/isResizable props (HIGH confidence)
