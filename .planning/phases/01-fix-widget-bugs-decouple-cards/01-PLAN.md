# Phase 1: Fix Widget Bugs + Decouple Existing Cards — Plan

**Created:** 2026-03-22
**Phase:** 01
**Status:** Executing

## Goal

Fix all v1.0 post-ship dashboard widget bugs and decouple all 8 existing dashboard cards from the monolithic DashboardDataContext to independent React Query hooks.

## Plans

### Plan 1: Fix Widget Drag/Resize (MH-01)
**Files:** `DashboardGrid.tsx`, `globals.css`
**Root cause:** `widget-wobble` CSS class applied to the grid item div uses `transform: rotate()` which overrides react-grid-layout's inline `transform: translate()`. CSS keyframe animations take priority over inline styles.
**Fix:** Move wobble class to an inner wrapper div, keeping the grid item div clean for react-grid-layout.

### Plan 2: Fix Config Panel Bugs (MH-02)
**Files:** `WidgetConfigPanel.tsx`, `WidgetWrapper.tsx`
**Bug A — Insta-close:** `setTimeout(fn, 0)` doesn't reliably prevent the click-outside handler from firing on the opening click. Fix: Use `requestAnimationFrame`.
**Bug B — Wrong position:** Panel rendered inside grid item with CSS transforms. `getBoundingClientRect()` + `position: fixed` doesn't account for ancestor transforms. Fix: `createPortal(panel, document.body)`.

### Plan 3: Fix Widget Picker "Added" State (MH-02)
**Files:** `Dashboard.tsx`
**Root cause:** `placedWidgetIds` computed from first breakpoint only. Fix: Compute from all breakpoints using a Set.

### Plan 4: Extract Kernel Hooks (MH-03, MH-04)
**Files:** New `lib/hooks/dashboard/*.ts`, `query-keys.ts`, `useDashboardData.ts`, 8 card components
**Approach:**
1. Create `useAgentCache` — shared React Query hook for `/api/cache` with `select` for per-hook slicing
2. Extract 6 domain hooks: `useAgentStatus`, `useHeartbeat`, `useSessions`, `useSubagentData`, `useAgentsData`, `useMissions`, `useIdeas`, `useMemoryEntries`
3. Each hook: independent React Query, SSE subscriptions, demo mode support
4. Rewrite `useDashboardData` as thin composition of new hooks
5. Update 8 cards to import hooks directly instead of context

## Success Criteria
- [x] Edit mode drag/resize works
- [x] Config panels open and position correctly
- [x] Widget Picker shows correct "Added" state
- [x] All 8 cards fetch data via independent hooks
- [x] DashboardDataContext still works (thin wrapper)
- [ ] Existing tests pass
- [ ] TypeScript clean
