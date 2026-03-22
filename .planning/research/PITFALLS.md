# Domain Pitfalls: Widget-First Architecture Conversion

**Domain:** Converting a 74k LOC page-based React+Tauri app to widget-first architecture
**Researched:** 2026-03-22

## Critical Pitfalls

Mistakes that cause rewrites or major architectural issues.

### Pitfall 1: Monolithic Context Expansion

**What goes wrong:** Instead of decoupling widgets from DashboardDataContext, developers add new module data to the existing context -- "just one more field." The context grows to fetch all 17 modules' data regardless of which widgets are visible.

**Why it happens:** The existing pattern (read from context) is the path of least resistance. Adding a field to `useDashboardData()` is 3 lines. Creating a new kernel hook is 30 lines.

**Consequences:** Every dashboard render triggers all 17 data fetches. Every state change in any module re-renders every widget. Dashboard becomes sluggish. Memory usage grows unbounded.

**Prevention:** Phase 1 explicitly decouples ALL existing cards before any new widgets are built. After Phase 1, `DashboardDataContext` has a deprecation comment. Code review rejects any new context consumers.

**Detection:** If `useDashboardData.ts` grows instead of shrinks during the milestone, this pitfall is happening.

### Pitfall 2: Two Competing Data Patterns

**What goes wrong:** Some widgets use the old context pattern, others use the new kernel hook pattern. Both coexist indefinitely. New contributors don't know which to use.

**Why it happens:** Phase 1 (decouple existing cards) gets skipped or partially completed. New module widgets are built in parallel with unmigrated cards. "We'll clean up later."

**Consequences:** Two sources of truth for the same data. Stale data in context-based cards while hook-based widgets show fresh data. Inconsistent behavior confuses users.

**Prevention:** Phase 1 MUST fully complete before Phase 2 starts. All 8 existing cards must use kernel hooks. No exceptions. The DashboardDataContext import must be unused before new widgets are registered.

**Detection:** `grep -r "useDashboardDataContext" frontend/src/` should return 0 results by the end of Phase 1.

### Pitfall 3: Full-Page Components as Widgets

**What goes wrong:** Someone registers `Messages.tsx` or `Notes.tsx` directly as a widget -- wrapping the 800-line full-page component in WidgetWrapper without decomposition.

**Why it happens:** It seems faster than decomposing. "Let's just make it work at any size." The full-bleed pages use `position: absolute; inset: 0` which fills any container.

**Consequences:** Layout breaks. The full-page component fights react-grid-layout for positioning. SSE connections multiply. 30+ state variables waste memory in a 4x3 card. The UI is unusable at small sizes (text cut off, scroll bars everywhere, interactive elements too small).

**Prevention:** Module classification (Tier 1/2/3) prevents this. Tier 3 modules explicitly get summary-only widgets, not wrapped full pages. The ARCHITECTURE.md anti-patterns section documents this.

**Detection:** Any widget component file > 200 lines is likely a wrapped full page. Widget components should be 50-100 lines -- they call a kernel hook and render a compact view.

### Pitfall 4: Dashboard State Migration Breaking Existing Users

**What goes wrong:** Personal page unification changes `createInitialState()` to include a "Home" page, but existing users already have dashboard-state in localStorage. Their existing layout is lost or corrupted.

**Why it happens:** The migration from "one Dashboard page" to "Home + Dashboard pages" requires careful handling of existing `DashboardState` in localStorage.

**Consequences:** Users lose their customized dashboard layouts. Trust damage -- they spent time arranging widgets and it was discarded.

**Prevention:** Add a localStorage migration (like the existing `migrations.ts` system) that preserves the user's existing layout as-is and adds a new "Home" page alongside it. Never overwrite existing pages -- only add the missing Home page if it doesn't exist.

**Detection:** After the migration, load the app with an existing dashboard-state in localStorage. All previously placed widgets must remain exactly where they were.

## Moderate Pitfalls

### Pitfall 5: Over-Decomposing Simple Modules

**What goes wrong:** Every sub-component of a simple module becomes its own widget. Todos gets split into "TodosList", "TodosInput", "TodosFilters", "TodosStats" -- 4 widgets for a task list.

**Prevention:** Follow the Tier classification. Tier 1 modules = ONE widget. Only Tier 2 modules warrant multiple widgets, and only when the sub-views genuinely make sense standalone on a dashboard.

### Pitfall 6: Widget Size Breakpoints Proliferate

**What goes wrong:** Each widget defines its own custom size breakpoints (`if w < 3 && h < 2 ... else if w < 6 ...`). No consistency across widgets. The same grid size looks different in every widget.

**Prevention:** Define 3 standard size categories (compact/medium/full) as a shared utility:
```typescript
function getWidgetDensity(size: { w: number; h: number }): 'compact' | 'medium' | 'full'
```
All widgets use this function. UI decisions (truncation, input visibility, etc.) are driven by the density tier, not raw w/h values.

### Pitfall 7: Polling Intervals Not Bounded

**What goes wrong:** Each widget sets its own `refetchInterval` in useQuery. Agent status polls every 5s. Missions polls every 10s. Todos polls every 15s. With 20 widgets on one page, the browser makes 80+ requests per minute.

**Prevention:** Use React Query's default `staleTime: 30_000` from the global QueryClient config. Only override for widgets that genuinely need faster updates (agent status: 10s). Document the approved intervals.

### Pitfall 8: Kernel Hooks With Side Effects

**What goes wrong:** A kernel hook (e.g., `useMissionsData()`) starts polling intervals, SSE connections, or timers. When 3 widgets on different pages all call this hook, 3 sets of side effects run.

**Prevention:** Kernel hooks should use React Query for polling (`refetchInterval`) -- React Query deduplicates this. For SSE/realtime, use `useTableRealtime()` which invalidates query caches -- React Query prevents duplicate fetches even if the invalidation fires from multiple hook instances. Avoid raw `setInterval` in kernel hooks.

### Pitfall 9: Config Panel Z-Index Wars

**What goes wrong:** Widget config panels (WidgetConfigPanel) render inside the WidgetWrapper, which is inside react-grid-layout's transformed containers. The panel gets clipped by `overflow: hidden` on parent elements or positioned incorrectly due to CSS transforms.

**Prevention:** Render config panels via a React portal to `document.body`. This escapes all parent positioning contexts. The existing `WidgetConfigPanel` already receives `anchorRef` for positioning -- portal rendering just changes where the DOM node lives.

## Minor Pitfalls

### Pitfall 10: Widget Picker Category Overflow

**What goes wrong:** With 8 categories and 40+ widgets, the picker becomes hard to navigate. Users can't find the widget they want.

**Prevention:** Add search to the Widget Picker (filter by name/description). Keep category tabs but also offer an "All" view. Consider sorting by recently used.

### Pitfall 11: Inconsistent Widget Card Styling

**What goes wrong:** New module widgets use different card styles, spacing, header patterns than the existing 8 dashboard cards. The dashboard looks like a patchwork.

**Prevention:** Create shared widget UI components: `WidgetHeader` (icon + title + optional badge), `WidgetFooterLink`, `WidgetEmptyState`, `WidgetLoadingState`. All new widgets compose from these shared parts.

### Pitfall 12: Tests Not Updated

**What goes wrong:** Existing tests in `frontend/src/lib/__tests__/` test the old patterns (dashboard-defaults with old widget IDs, modules without widgetIds, etc.). Tests pass but don't cover the new architecture.

**Prevention:** Update tests alongside each phase. Phase 1: update card tests to use kernel hooks instead of context. Phase 2: add widget registration tests. Phase 3: add Home page default layout tests.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Bug fixes | react-grid-layout transform context makes positioning hard | Use portals for config panels; debug transform chain |
| Phase 1: Card decoupling | Breaking the `/api/cache` blob into typed fields | Create `useAgentCache()` that parses the blob once, returns typed fields |
| Phase 2: Tier 1 widgets | Existing page tests break when data hooks are extracted | Move test assertions to hook tests, add widget render tests |
| Phase 3: Personal unification | Existing users lose dashboard state | localStorage migration (migration v8+) that preserves existing layouts |
| Phase 4: Notes decomposition | Graph view needs canvas/SVG that may not resize well in grid cells | Set appropriate minSize (e.g., 4x3 for graph) and test at minimum |
| Phase 4: Homelab widgets | Proxmox/OPNsense data shape varies by user's setup | Widget shows EmptyState when service unavailable, not error |
| Phase 5: Presets | Preset references widget IDs that user has disabled | Filter preset widgets to only include enabled modules |
| Phase 6: Messages summary | SSE connection per widget is wasteful | Summary widget uses useQuery on conversation list, NOT useMessagesSSE |
| Phase 7: Context removal | Some edge case still uses the context | grep for all useDashboardDataContext imports before deleting |

## Sources

- Direct codebase analysis of existing bugs (WidgetConfigPanel positioning, react-grid-layout drag issues)
- v1.0 post-ship bug documentation (memory/project_v1_postship_bugs.md)
- React Query deduplication behavior documentation
- react-grid-layout known issues with CSS transforms and overlapping click handlers
