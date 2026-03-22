# Phase 1: Fix Widget Bugs + Decouple Existing Cards - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix all v1.0 post-ship dashboard widget bugs (drag/resize, config panels, widget picker state) and decouple all 8 existing dashboard cards from DashboardDataContext to independent React Query hooks. Pure infrastructure — no new features.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure/bugfix phase with clear technical requirements. User specified "default for all."

Key approach decisions:
- Config panel positioning: Use createPortal to render outside grid transform context
- Config panel insta-close: Add click event timing guard (requestAnimationFrame or stopPropagation)
- Drag/resize: Debug react-grid-layout interaction — likely CSS/event capture issue
- Widget Picker "Added" state: Compute from all breakpoints, not just first
- Kernel hooks: Extract from useDashboardData into standalone hooks in lib/hooks/
- Cache endpoint: Keep single /api/cache but parse per-hook with React Query select

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useTodos()` hook — exemplary kernel hook pattern with optimistic updates
- `useRealtimeSSE()` — real-time subscription architecture, reusable by all hooks
- `useTableRealtime()` — convenience wrapper for single-table subscriptions
- `queryKeys` — centralized key definitions, already has keys for most data
- `api` wrapper — unified fetch layer with auth and error handling

### Established Patterns
- `useSyncExternalStore` for reactive state (dashboard-store, sidebar-settings)
- React Query for server state with SSE invalidation
- `React.lazy` with `.then(m => ({ default: m.Name }))` for named exports
- `isDemoMode()` + demo data fallback in all hooks
- Widget registration via `registerWidget()` in widget-registry.ts

### Integration Points
- DashboardGrid.tsx — react-grid-layout integration (bug fixes here)
- WidgetWrapper.tsx — per-widget boundary (config panel portal here)
- WidgetConfigPanel.tsx — positioning fix needed
- WidgetPicker.tsx — "Added" state fix needed
- useDashboardData.ts — kernel hook extraction source
- dashboard-context.ts — thin wrapper after decoupling
- 8 card components — update imports from context to hooks

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Follow established patterns from useTodos() for kernel hook extraction.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
