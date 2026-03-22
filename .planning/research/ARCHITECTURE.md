# Architecture Patterns: Widget-First Conversion

**Domain:** Desktop app module system (dual-mode: full-page + dashboard widget)
**Researched:** 2026-03-22
**Confidence:** HIGH (derived from direct codebase analysis of 15+ source files)

---

## Executive Summary

The current architecture has two parallel rendering paths that must be unified:

1. **Full-page route components** (`pages/*.tsx`) rendered by React Router inside `LayoutShell > main > Outlet`
2. **Dashboard widget cards** (`pages/dashboard/*Card.tsx`) rendered by `DashboardGrid > WidgetWrapper > React.lazy(component)`

These paths share nothing. Page components own their own data fetching (React Query hooks, SSE subscriptions). Widget cards read from `DashboardDataContext`, a monolithic context that bundles 20+ data streams from `useDashboardData()`. The conversion challenge is making every module work in both contexts without duplication, without breaking either rendering path, and without a monolithic context that scales to 17 modules.

The recommended architecture introduces a **Module Kernel** layer: hooks that own all data fetching and logic, consumed independently by both widget shells (compact dashboard view) and page shells (full-page route). The DashboardDataContext is deprecated incrementally as each widget gains independent data fetching.

---

## Current Architecture (As-Is)

### Component Hierarchy

```
LayoutShell
  Sidebar (nav-items.ts driven)
  <main>
    <Outlet />  (React Router)
      Pages (e.g., Dashboard, Messages, Notes, Todos)

Dashboard (page)
  DashboardDataContext.Provider (useDashboardData hook)
    DashboardGrid (react-grid-layout)
      WidgetWrapper (per cell)
        React.lazy(WidgetDefinition.component)
          AgentStatusCard (reads from DashboardDataContext)
```

### Key Contracts

| Contract | Location | What It Does |
|----------|----------|--------------|
| `WidgetProps` | `widget-registry.ts:22-26` | `{ widgetId, config, isEditMode, size }` passed to every widget |
| `WidgetDefinition` | `widget-registry.ts:40-57` | Registry entry: id, metadata, lazy component, size constraints, config schema |
| `WidgetWrapper` | `WidgetWrapper.tsx` | Error boundary + Suspense + edit chrome + lazy loading |
| `DashboardDataContext` | `dashboard-context.ts` | Monolithic context from `useDashboardData()` |
| `AppModule` | `modules.ts:1-9` | Module metadata: id, name, route, icon, platform |
| `SidebarConfig` | `sidebar-config.ts` | Categories, custom names, drag order, recycle bin |
| `DashboardState` | `dashboard-store.ts` | Pages, layouts per breakpoint, widget configs, edit mode |

### Problems With Current Design

1. **DashboardDataContext is monolithic.** It fetches agent status, heartbeat, sessions, subagents, agents, missions, memory, ideas -- all in one hook. Adding 17 modules to this context would make it fetch everything on every dashboard render regardless of which widgets are placed.

2. **Widget cards have no independent data fetching.** Every existing card calls `useDashboardDataContext()`. Without the Dashboard page as a parent, they crash (`throw new Error('must be used within Dashboard')`).

3. **Full-page components are monoliths.** `Messages.tsx` is 800+ lines with 30+ state variables. `Notes.tsx` uses `position: absolute; inset: 0` for full-bleed layout. These cannot render inside a 4x3 grid cell as-is.

4. **No concept of "widget variant" of a page.** The page IS the full experience. There is no compact/summary variant that could fit in a grid cell.

5. **Personal page duplicates data fetching.** `Personal.tsx` re-fetches todos, missions, calendar, homelab -- same data as Dashboard but through different code paths.

---

## Recommended Architecture (To-Be)

### Core Pattern: Module Kernel + View Shells

Every module gets decomposed into three layers:

```
Module Kernel (data + logic)        -- hooks/[module]/use[Module]Data.ts
  Widget Shell (compact view)       -- widgets/[module]/[Module]Widget.tsx
  Page Shell (full view)            -- pages/[Module].tsx (composes widgets + page chrome)
```

**Module Kernel:** A custom hook (or set of hooks) that owns all data fetching via React Query, mutations, and real-time subscriptions. No UI. Fully independent -- works anywhere in the React tree.

**Widget Shell:** A component that satisfies `WidgetProps`, calls the kernel hook, and renders a compact UI. Registered in the Widget Registry. Can be placed on any dashboard page.

**Page Shell:** The full-page route component. Composes one or more widget shells plus page-specific chrome (headers, toolbars, navigation panels). For simple modules, the page shell IS the widget shell rendered full-size. For complex modules (Messages, Notes), the page shell adds layout panels (file tree, conversation list) around the widget.

### Architecture Diagram

```
WidgetRegistry
  registerWidget({ id: 'todos-list', component: () => import('widgets/todos/TodosWidget') })
  registerWidget({ id: 'messages-recent', component: () => import('widgets/messages/MessagesWidget') })
  registerWidget({ id: 'notes-editor', component: () => import('widgets/notes/NotesWidget') })
  ...

DashboardGrid
  WidgetWrapper { pluginId: 'todos-list' }
    TodosWidget (WidgetProps)
      useTodosData()         -- kernel: React Query
      <TodosCompactView />   -- size-responsive UI

Pages/Todos.tsx (route)
  <PageHeader />
  <TodosWidget size={{ w: 12, h: 999 }} isEditMode={false} />
  -- OR --
  useTodosData()             -- same kernel
  <TodosFullView />          -- expanded UI with more features

Pages/Notes.tsx (route)   -- complex module
  <FileTree />              -- page-only panel
  <NotesEditorWidget />     -- registered widget
  <NotesGraphWidget />      -- registered widget (separate)
```

### The WidgetProps Contract (No Changes Needed)

The existing `WidgetProps` interface is sufficient:

```typescript
interface WidgetProps {
  widgetId: string
  config: Record<string, unknown>
  isEditMode: boolean
  size: { w: number; h: number }
}
```

Widgets use `size` to determine their rendering density:
- **Compact** (`w <= 4, h <= 3`): Summary view, minimal chrome, truncated lists
- **Medium** (`w <= 8, h <= 5`): Expanded view, more detail, interactions enabled
- **Full** (`w > 8 or h > 5`): Near-page experience, all features

When rendered as a page, the page shell passes `size: { w: 12, h: 999 }` to signal "render at full size."

### Data Fetching Independence

**Before (DashboardDataContext):**
```typescript
// useDashboardData.ts -- fetches EVERYTHING
const { missions, memory, status, heartbeat, ... } = useDashboardData()
// DashboardDataContext.Provider wraps the entire grid
// Every card must be a child of Dashboard
```

**After (per-widget kernels):**
```typescript
// hooks/missions/useMissionsData.ts
export function useMissionsData() {
  const { data } = useQuery({
    queryKey: queryKeys.missions,
    queryFn: () => api.get('/api/missions'),
    refetchInterval: 30_000,
  })
  // ... mutations, filtering, etc.
  return { missions, updateStatus, deleteMission }
}

// widgets/missions/MissionsWidget.tsx
export default function MissionsWidget({ size, config }: WidgetProps) {
  const { missions, updateStatus } = useMissionsData()
  // Render based on size
}
```

React Query's built-in deduplication means multiple widgets using `queryKeys.missions` share a single network request. No coordination needed.

### Real-Time Subscriptions

The existing `useRealtimeSSE` and `useTableRealtime` hooks work independently -- they invalidate React Query caches, not component state. Each widget that needs real-time updates calls its own subscription hook. React Query deduplication + SSE channel sharing means no duplicate connections.

---

## Component Boundaries

### New Components to Create

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `hooks/[module]/use[Module]Data.ts` | Per-module kernel | Data fetching, mutations, real-time (17 modules) |
| `widgets/[module]/[Module]Widget.tsx` | Per-module widget shell | Compact + responsive UI, satisfies `WidgetProps` |
| `widgets/[module]/index.ts` | Per-module barrel | Re-exports for clean imports |
| `widgets/register.ts` | Global | Registers all module widgets (parallel to `primitives/register.ts`) |
| `lib/widget-presets.ts` | Global | Category preset definitions (Notes preset, Monitoring preset, etc.) |

### Existing Components to Modify

| Component | Change | Reason |
|-----------|--------|--------|
| `widget-registry.ts` | Add new category values, keep existing API | New module widgets need expanded categories |
| `dashboard-context.ts` | Deprecate -- keep for backwards compat during migration | Widgets gain independent data fetching |
| `useDashboardData.ts` | Gradually slim down -- remove data that widgets now fetch themselves | Reduce monolithic context |
| `Dashboard.tsx` | Remove DashboardDataContext.Provider once all cards migrated | Clean up |
| `dashboard-defaults.ts` | Generate layouts for new module widgets | More widgets in the picker |
| `pages/Personal.tsx` | Convert to DashboardGrid-based layout | Unify with widget system |
| `DashboardEditBar.tsx` | Enable for all grid pages, not just Dashboard route | Universal editing |
| `modules.ts` | Add `widgetIds` field to AppModule | Map modules to their widgets |
| `sidebar-config.ts` | Add preset support for complex modules | Category presets |
| `main.tsx` | Call `registerModuleWidgets()` at startup | Parallel to `registerPrimitives()` |

### Components That Do NOT Change

| Component | Why Unchanged |
|-----------|---------------|
| `WidgetWrapper.tsx` (core logic) | Already handles lazy loading, error boundaries, Suspense, edit chrome |
| `DashboardGrid.tsx` | Already handles responsive layouts, drag/resize, breakpoints |
| `DashboardState / dashboard-store.ts` | Already supports multi-page, widget configs, recycle bin |
| `LayoutShell.tsx` | Continues to render routes; pages just compose widgets internally |
| `Sidebar.tsx` | Category system already supports drag reorder and customization |
| React Router setup in `main.tsx` | Routes remain -- pages still exist as full-page experiences |

---

## Patterns to Follow

### Pattern 1: Size-Responsive Widget Rendering

**What:** Widget components inspect the `size` prop and render different UI densities.

**When:** Every widget that can appear on a dashboard AND as a page.

**Example:**
```typescript
// widgets/todos/TodosWidget.tsx
import { useTodosData } from '@/hooks/todos/useTodosData'
import type { WidgetProps } from '@/lib/widget-registry'

export default function TodosWidget({ size, config, isEditMode }: WidgetProps) {
  const { todos, addTodo, toggleTodo, deleteTodo } = useTodosData()
  const isCompact = size.w <= 4 && size.h <= 3
  const limit = isCompact ? 5 : undefined

  return (
    <div className="card" style={{ padding: isCompact ? '12px' : '20px', height: '100%' }}>
      <WidgetHeader title="Todos" icon={CheckSquare} />
      <TodoList
        todos={todos}
        limit={limit}
        showInput={!isCompact}
        onToggle={toggleTodo}
        onDelete={deleteTodo}
      />
      {isCompact && todos.length > 5 && (
        <WidgetFooterLink to="/todos" count={todos.length} />
      )}
    </div>
  )
}
```

### Pattern 2: Page as Widget Composition

**What:** Full-page components compose their module's widgets plus page-specific chrome.

**When:** Converting existing page components.

**Example:**
```typescript
// pages/Todos.tsx (converted)
export default function TodosPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader defaultTitle="Todos" />
      <TodosWidget
        widgetId="page-todos"
        config={{}}
        isEditMode={false}
        size={{ w: 12, h: 999 }}  // signals "render full"
      />
    </div>
  )
}
```

### Pattern 3: Complex Module Decomposition

**What:** Complex modules (Messages, Notes) decompose into multiple widgets, where each sub-component is independently widgetizable.

**When:** Modules that have multiple panels/views that could be useful independently.

**Example (Notes):**
```
Notes Module
  notes-graph    -- Graph view widget (works standalone on dashboard)
  notes-recent   -- Recent notes list (compact widget)
  notes-editor   -- Note editor (needs larger space, minSize 6x4)

Notes Page (route):
  FileTree panel (page-only, not a widget)
  Toolbar (page-only)
  NotesEditorWidget OR NotesGraphWidget (based on viewMode)

Dashboard:
  notes-graph at size 4x3 (standalone graph visualization)
  notes-recent at size 3x2 (recent notes list)
```

The key insight: not every sub-component needs to be a widget. The FileTree is page-only UI that provides navigation context. Only the parts that make sense standalone become widgets.

### Pattern 4: Category Presets

**What:** Pre-configured dashboard pages that set up an entire module experience as a collection of widgets.

**When:** Complex modules that need multiple widgets working together to replicate a "page-like" experience on a dashboard.

**Example:**
```typescript
// lib/widget-presets.ts
export interface WidgetPreset {
  id: string
  name: string
  description: string
  icon: string
  widgets: Array<{
    pluginId: string
    layout: { w: number; h: number; x: number; y: number }
    config: Record<string, unknown>
  }>
}

export const PRESETS: WidgetPreset[] = [
  {
    id: 'monitoring',
    name: 'System Monitoring',
    description: 'Agent status, heartbeat, network, and sessions',
    icon: 'ChartLine',
    widgets: [
      { pluginId: 'agent-status', layout: { w: 4, h: 2, x: 0, y: 0 }, config: {} },
      { pluginId: 'heartbeat', layout: { w: 4, h: 2, x: 4, y: 0 }, config: {} },
      { pluginId: 'network', layout: { w: 4, h: 2, x: 8, y: 0 }, config: {} },
      { pluginId: 'sessions', layout: { w: 6, h: 3, x: 0, y: 2 }, config: {} },
    ],
  },
  {
    id: 'notes-workspace',
    name: 'Notes Workspace',
    description: 'Knowledge graph, recent notes, and quick capture',
    icon: 'FileText',
    widgets: [
      { pluginId: 'notes-graph', layout: { w: 8, h: 4, x: 0, y: 0 }, config: {} },
      { pluginId: 'notes-recent', layout: { w: 4, h: 4, x: 8, y: 0 }, config: {} },
    ],
  },
]
```

Presets are applied to dashboard pages via the Widget Picker (new "Presets" tab) or when creating a new dashboard page.

### Pattern 5: Widget Footer Link

**What:** Compact widgets include a "View all" link that navigates to the full page.

**When:** Any widget that truncates data in compact mode.

**Example:**
```typescript
// components/widgets/WidgetFooterLink.tsx
function WidgetFooterLink({ to, count, label }: { to: string; count?: number; label?: string }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--accent)', fontSize: '11px', fontWeight: 500,
        padding: '8px 0 0', width: '100%', textAlign: 'center',
      }}
    >
      {label || `View all${count ? ` (${count})` : ''}`}
    </button>
  )
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Data Context

**What:** Continuing to add data streams to `DashboardDataContext` / `useDashboardData()`.

**Why bad:** The context re-renders all consumers on any state change. With 17 modules, every heartbeat tick would re-render every widget. Performance degrades quadratically.

**Instead:** Each widget uses its own React Query hooks. React Query handles caching, deduplication, and stale-while-revalidate. No coordination context needed.

### Anti-Pattern 2: Render-Mode Prop Drilling

**What:** Passing a `mode: 'page' | 'widget'` prop and branching the entire component tree.

**Why bad:** Creates two diverging code paths inside one component. Maintenance nightmare. The "widget mode" and "page mode" branches drift apart over time.

**Instead:** Use the `size` prop from `WidgetProps`. Widgets render responsively based on available space. No explicit mode -- the widget simply renders differently at different sizes. Pages set `size.w = 12, size.h = 999` to signal "full size."

### Anti-Pattern 3: Wrapping Full Pages in Widget Wrappers

**What:** Registering `Messages.tsx` (800-line full-page component) as a widget.

**Why bad:** Messages uses `position: absolute; inset: 0` for full-bleed layout. It manages 30+ state variables, SSE connections, drag-and-drop, compose mode, in-thread search. Cramming this into a 4x3 grid cell produces a broken UX and layout conflicts with the grid engine.

**Instead:** Decompose. Extract `MessagesRecentWidget` (recent conversations list), `MessagesUnreadWidget` (unread count badge). The full Messages page remains a route component that provides the full experience.

### Anti-Pattern 4: Two Widget Registries

**What:** Creating a separate "page widget" registry alongside the existing widget registry.

**Why bad:** Duplicates the registration pattern, config schema system, and picker UI.

**Instead:** One registry. Module widgets are registered the same way as primitive widgets and dashboard cards. The WidgetPicker shows them all, differentiated by `category`.

### Anti-Pattern 5: Eager Loading All Widget Modules

**What:** Importing all 17 module widgets at startup instead of lazy-loading.

**Why bad:** Adds all module code to the initial bundle.

**Instead:** Every widget registration uses a lazy `component` function: `component: () => import('./widgets/todos/TodosWidget')`. This is already the pattern in `widget-registry.ts` and `primitives/register.ts`. Follow it exactly.

---

## Data Flow

### Current Data Flow (Dashboard)

```
useDashboardData()
  api.get('/api/cache') --> all agent data in one blob
  api.post('/api/cache-refresh')
  useQuery(queryKeys.missions)
  useQuery(queryKeys.memory)
  useQuery(queryKeys.ideas)
  useQuery(queryKeys.subagentsActive)
  useRealtimeSSE(['missions', 'agents', 'ideas', 'cache'])
  setInterval(fastTick, 10_000)
  setInterval(slowTick, 30_000)
    |
    v
  DashboardDataContext.Provider value={dashboardData}
    |
    v
  AgentStatusCard calls useDashboardDataContext() --> reads { status }
  MissionsCard calls useDashboardDataContext()   --> reads { missions }
  HeartbeatCard calls useDashboardDataContext()   --> reads { heartbeat }
  ...every card reads from same context, all re-render together
```

### Target Data Flow (Per-Widget)

```
MissionsWidget
  useMissionsData()
    useQuery(queryKeys.missions, '/api/missions')
    useTableRealtime('missions')
    --> { missions, updateStatus, deleteMission }

AgentStatusWidget
  useAgentCache()
    useQuery(['agent-cache'], '/api/cache')
    --> { status, heartbeat, sessions, network }  (parsed from cache blob)
    Note: This is ONE shared query for all agent monitoring widgets.
    Each widget reads only the fields it needs from the return value.

TodosWidget
  useTodosData()
    useQuery(queryKeys.todos, '/api/todos')
    useTableRealtime('todos')
    --> { todos, addTodo, toggleTodo, deleteTodo }

NotesGraphWidget
  useVault()  (already exists in hooks/notes/useVault.ts)
    --> { notes, loading, syncing }
```

React Query guarantees that `queryKeys.missions` is only fetched once regardless of how many `MissionsWidget` instances exist across different dashboard pages. The `staleTime: 30_000` in the QueryClient config handles the rest.

### Data Flow for Complex Modules

Messages is the hardest case. The SSE connection (`useMessagesSSE`), conversation list, and thread state are tightly coupled.

```
Messages Module Decomposition:

MessagesRecentWidget (dashboard widget)
  useConversationList()  (already exists as a hook in hooks/messages/)
  --> shows 5 most recent conversations with unread count
  --> click navigates to Messages page at that conversation

MessagesPage (full route -- unchanged)
  useConversationList()
  useMessagesSSE()
  useMessageCompose()
  ConversationList | MessageThread | ComposePanel
  --> full interactive experience with SSE, compose, drag-and-drop
```

The widget version does NOT maintain SSE connections or compose state. It fetches conversation list data (which is cheap) and links out to the full page. This is the right tradeoff -- you do not want persistent SSE connections per dashboard widget.

---

## Module Classification for Conversion

### Tier 1: Simple Extraction (data hook + widget wrapper)

These modules already have clean data hooks or very simple page components. Converting them is extracting the data logic into a standalone hook and wrapping the UI in a WidgetProps-compatible component.

| Module | Existing Hook / Data Source | Widget Approach |
|--------|---------------------------|-----------------|
| Todos | `useTodos()` in `lib/hooks/useTodos.ts` | Extract list UI from `Todos.tsx`, make size-responsive |
| Calendar | `useQuery(queryKeys.calendar)` | Compact: today's events. Full: week/month view |
| Reminders | `useQuery` in page | Compact: due-soon list. Full: full list with create |
| Knowledge | `useQuery(queryKeys.knowledge)` | Compact: recent entries. Full: search + slide panel |
| Pomodoro | Component state (timer) | Compact: timer display only. Full: timer + heatmap + sidebar |
| Memory | `useQuery(queryKeys.memory)` | Already a dashboard card -- make independent |
| Missions | `useQuery(queryKeys.missions)` | Already a dashboard card -- make independent |

### Tier 2: Moderate Decomposition (multiple widgets per module)

These need multiple widget variants because they have distinct sub-views.

| Module | Widgets | Notes |
|--------|---------|-------|
| Notes | `notes-graph`, `notes-recent`, `notes-editor` | Graph and recent work standalone; editor needs min 6x4 |
| Pipeline | `pipeline-status`, `pipeline-ideas`, `pipeline-stale` | Each sub-tab becomes a widget |
| Email | `email-unread`, `email-digest` | Compact: unread count. Full: list with account switcher |
| Homelab | `homelab-vms`, `homelab-network` | Proxmox VMs and OPNsense as separate widgets |
| Media | `media-upcoming`, `media-recent` | Upcoming shows and recent activity |

### Tier 3: Complex (page remains primary, widget is summary only)

These have deep interactive states that only make sense full-screen. The widget version is a summary/entry-point.

| Module | Widget | Full Page |
|--------|--------|-----------|
| Messages | `messages-recent` (5 recent convos + unread) | Full conversation list + thread + compose |
| Chat | `chat-quick` (last message + quick input) | Full chat thread with model switching |
| Agents | `agents-overview` (status list) | Full agent management with live processes |

### Existing Dashboard Cards (Migration Path)

The 8 existing cards in `pages/dashboard/*Card.tsx` need migration from `useDashboardDataContext()` to independent hooks:

| Card | Target Hook | Shares Query With |
|------|-------------|-------------------|
| AgentStatusCard | `useAgentCache()` | HeartbeatCard, NetworkCard, SessionsCard |
| HeartbeatCard | `useAgentCache()` | AgentStatusCard, NetworkCard, SessionsCard |
| NetworkCard | `useAgentCache()` | AgentStatusCard, HeartbeatCard, SessionsCard |
| SessionsCard | `useAgentCache()` | AgentStatusCard, HeartbeatCard, NetworkCard |
| AgentsCard | `useAgentCache()` + sorted agents | -- |
| MissionsCard | `useMissionsData()` | Missions page widget |
| MemoryCard | `useQuery(queryKeys.memory)` | Memory page widget |
| IdeaBriefingCard | `useQuery(queryKeys.ideas)` | Ideas page widget |

Note: `useAgentCache()` is a new hook that reads the `/api/cache` blob and returns typed fields. The 4 monitoring cards that currently share the `useDashboardData()` cache will share this new hook instead. React Query deduplication ensures `/api/cache` is fetched once.

---

## Widget Registration Strategy

### Expanded Category Taxonomy

Current categories: `'monitoring' | 'productivity' | 'ai' | 'media' | 'custom' | 'primitives'`

Expand to:
```typescript
type WidgetCategory =
  | 'monitoring'      // Agent status, heartbeat, network, sessions, homelab
  | 'productivity'    // Todos, calendar, reminders, pomodoro, pipeline
  | 'ai'              // Agents, missions, memory, chat
  | 'communication'   // Messages, email
  | 'media'           // Media radar
  | 'knowledge'       // Notes, knowledge base
  | 'custom'          // Bjorn-generated modules
  | 'primitives'      // StatCard, charts, tables, forms, etc.
```

### Registration at Startup

Follow the existing `registerPrimitives()` pattern:

```typescript
// widgets/register.ts
export function registerModuleWidgets(): void {
  registerWidget({
    id: 'todos-list',
    name: 'Todos',
    description: 'Task list with add, toggle, and delete',
    icon: 'CheckSquare',
    category: 'productivity',
    tier: 'builtin',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    configSchema: { fields: [
      { key: 'showCompleted', label: 'Show completed', type: 'toggle', default: false },
      { key: 'limit', label: 'Max items', type: 'number', default: 10, min: 3, max: 50 },
    ]},
    component: () => import('./todos/TodosWidget'),
  })
  // ... one registerWidget() call per module widget
}

// main.tsx (add after existing calls)
registerPrimitives()       // existing -- 11 primitive widgets
registerModuleWidgets()    // NEW -- ~25 module widgets
loadBjornModules()         // existing -- AI-generated modules
```

### Module-to-Widget Mapping

Extend `AppModule` in `modules.ts`:

```typescript
export interface AppModule {
  id: string
  name: string
  description: string
  icon: string
  route: string
  widgetIds: string[]        // NEW: widgets this module provides
  requiresConfig?: string[]
  platform?: 'macos' | 'linux' | 'windows' | 'all'
}
```

This lets the Widget Picker filter by enabled modules and lets the module toggle control widget visibility.

---

## Personal Page Unification

The Personal page (`pages/Personal.tsx`) currently renders a static card layout:

```
MorningBrief
DailyReviewWidget
TodoSection
HomelabSection
```

Convert it to a dashboard grid page. Instead of a hardcoded component tree, Personal becomes another dashboard page in the `DashboardState.pages` array.

The "Home" page (route `/`) renders the first `DashboardState` page. The existing "Dashboard" page (route `/dashboard`) renders the same grid engine with the agents page ID. With unification, both routes point to the same `DashboardGrid` component with different `pageId` values.

```typescript
// Default pages in createInitialState():
pages: [
  {
    id: 'home',
    name: 'Home',
    sortOrder: 0,
    layouts: generateHomeDefault(),  // todos, calendar, morning-brief, homelab widgets
    widgetConfigs: {},
  },
  {
    id: 'agents',
    name: 'Agents',
    sortOrder: 1,
    layouts: generateAgentDefault(), // agent-status, heartbeat, missions, etc.
    widgetConfigs: {},
  },
]
```

---

## Build Order (Suggested Phases for Roadmap)

### Phase 1: Fix Widget Bugs + Decouple Existing Cards

**Prerequisite for everything.** Fix the broken edit mode (drag/resize), config panel positioning, and widget picker state issues documented in the v1.0 post-ship bugs.

Then migrate the 8 existing dashboard cards from `useDashboardDataContext()` to independent hooks. This proves the pattern works without adding new widgets.

**New files:**
- `hooks/agents/useAgentCache.ts` (replaces cache portion of useDashboardData)
- `hooks/missions/useMissionsData.ts`

**Modified files:**
- All 8 `pages/dashboard/*Card.tsx` (remove context dependency)
- `dashboard-context.ts` (add deprecation comment)
- `useDashboardData.ts` (slim down, remove data now owned by kernel hooks)

**Dependencies:** None
**Risk:** Low (refactor existing code, no new features)

### Phase 2: Convert Tier 1 Modules to Widgets

Register simple module widgets. Each gets a kernel hook + widget component.

**New files (per module, ~7 modules):**
- `hooks/[module]/use[Module]Data.ts`
- `widgets/[module]/[Module]Widget.tsx`
- `widgets/register.ts`

**Modules:** Todos, Calendar, Reminders, Knowledge, Pomodoro, Memory (page version), Missions (page version)

**Dependencies:** Phase 1 (pattern proven with existing cards)
**Risk:** Low (simple modules, clean extraction)

### Phase 3: Unify Personal + Dashboard Pages

Convert Personal page to use DashboardGrid. Both `/` and `/dashboard` render the grid engine with different page IDs. Add default layouts for the "Home" page using Tier 1 module widgets (todos, calendar, etc.).

**Modified files:**
- `pages/Personal.tsx` (rewrite to grid-based rendering)
- `pages/Dashboard.tsx` (shared grid component)
- `dashboard-store.ts` (initial state with Home + Agents pages)
- `dashboard-defaults.ts` (add Home page default layout)

**Dependencies:** Phase 2 (Tier 1 widgets exist to populate Home page)
**Risk:** Medium (user-facing layout change, migration of existing dashboard-state)

### Phase 4: Convert Tier 2 Modules to Widgets

Handle modules that decompose into multiple widgets (Notes, Pipeline, Email, Homelab, Media).

**New files (per module, ~5 modules with 2-3 widgets each):**
- Multiple widget files per module
- Shared kernel hooks per module

**Dependencies:** Phase 2 (pattern proven with Tier 1)
**Risk:** Medium (more complex decomposition decisions per module)

### Phase 5: Category Presets + Widget Picker Enhancement

Add preset system to Widget Picker. Allow one-click "Notes Workspace" or "Monitoring" preset that populates a dashboard page with a curated widget arrangement.

**New files:**
- `lib/widget-presets.ts`
- Widget Picker "Presets" tab component

**Modified files:**
- `WidgetPicker.tsx` (add presets tab)
- `dashboard-store.ts` (add applyPreset function)

**Dependencies:** Phase 4 (all module widgets registered for presets to reference)
**Risk:** Low (additive feature, no breaking changes)

### Phase 6: Convert Tier 3 Modules (Summary Widgets)

Create summary widgets for Messages, Chat, and Agents. These are compact entry-point widgets that link to the full page experience.

**New files:**
- `widgets/messages/MessagesRecentWidget.tsx`
- `widgets/chat/ChatQuickWidget.tsx`
- `widgets/agents/AgentsOverviewWidget.tsx`

**Dependencies:** Phase 2 (pattern proven)
**Risk:** Low (summary-only, no full interactive experience needed in widget)

### Phase 7: Remove DashboardDataContext + Cleanup

Once all cards use independent hooks, remove the monolithic context. Ensure edit mode works in production builds. Update tests.

**Modified files:**
- `Dashboard.tsx` (remove context provider wrapper)
- `dashboard-context.ts` (delete file)
- `useDashboardData.ts` (delete or keep for any remaining non-widget dashboard logic)

**Dependencies:** All previous phases complete
**Risk:** Low (cleanup, all widgets already independent)

---

## Scalability Considerations

| Concern | At 8 widgets (current) | At 30 widgets (all modules) | At 100+ widgets (with Bjorn) |
|---------|------------------------|---------------------------|------------------------------|
| Bundle size | ~200KB lazy chunks | ~400KB total (all lazy-loaded) | No growth per unused widget |
| React Query queries | 5 active queries | 15-20 active (deduplicated) | Bounded by visible widgets |
| Re-renders | Entire grid on context change | Per-widget on query invalidation | Same isolation |
| Memory | Single context holds all data | Per-query cache (GC'd by React Query) | React Query handles cleanup |
| Widget Picker items | 19 items (8 built-in + 11 primitives) | 40-50 items | Need search/filter in picker |
| Dashboard store | ~2KB localStorage | ~5KB localStorage | ~10KB max (layouts are compact) |

---

## Sources

- Direct codebase analysis (2026-03-22), HIGH confidence:
  - `frontend/src/lib/widget-registry.ts` -- WidgetProps contract, registration pattern
  - `frontend/src/components/dashboard/WidgetWrapper.tsx` -- rendering pipeline
  - `frontend/src/pages/dashboard/DashboardGrid.tsx` -- grid engine
  - `frontend/src/pages/dashboard/useDashboardData.ts` -- monolithic context problem
  - `frontend/src/pages/dashboard/dashboard-context.ts` -- context coupling
  - `frontend/src/lib/dashboard-store.ts` -- state management (pages, layouts, configs)
  - `frontend/src/lib/dashboard-defaults.ts` -- layout generation pattern
  - `frontend/src/pages/notes/Notes.tsx` -- complex module (full-bleed, multi-panel)
  - `frontend/src/pages/Messages.tsx` -- complex module (SSE, 30+ state vars)
  - `frontend/src/pages/Personal.tsx` -- duplicate data fetching problem
  - `frontend/src/pages/Todos.tsx` -- simple module baseline
  - `frontend/src/lib/modules.ts` -- module definitions (17 modules)
  - `frontend/src/lib/sidebar-config.ts` -- category system
  - `frontend/src/components/LayoutShell.tsx` -- rendering container
  - `frontend/src/main.tsx` -- router setup, startup registration
  - `frontend/src/components/primitives/register.ts` -- widget registration pattern
  - `frontend/src/pages/dashboard/AgentStatusCard.tsx` -- existing card context coupling
  - `frontend/src/pages/dashboard/MissionsCard.tsx` -- existing card context coupling
- React Query deduplication behavior: HIGH confidence (documented core feature)
- react-grid-layout responsive grid: HIGH confidence (in production use)
