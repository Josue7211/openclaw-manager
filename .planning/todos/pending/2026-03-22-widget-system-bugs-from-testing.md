---
created: 2026-03-22T17:25:00.000Z
title: Widget system bugs from live testing
area: ui
files:
  - frontend/src/pages/dashboard/DashboardGrid.tsx
  - frontend/src/components/dashboard/WidgetPicker.tsx
  - frontend/src/components/dashboard/WidgetWrapper.tsx
  - frontend/src/lib/dashboard-store.ts
  - frontend/src/lib/home-store.ts
---

## Problem

Multiple bugs found during live testing of the widget system:

### Bug 1: Widget resize not working
- Can only drag to swap/reorder widgets, cannot resize in any direction
- react-grid-layout's resize handles are likely covered by the inner wrapper div (`width: 100%; height: 100%` on the wobble wrapper)
- The `react-resizable-handle` spans are children of the grid item, but the inner content div fills the entire space and sits on top
- **Root cause:** The inner `<div style={{ width: '100%', height: '100%' }}>` (added for wobble fix) covers the resize handles
- **Fix:** Either give resize handles a higher z-index, or restructure so the inner wrapper doesn't cover them, or add `pointer-events: none` to inner wrapper and `pointer-events: auto` to WidgetWrapper

### Bug 2: Widgets don't get marked as "Added" in picker
- After adding a widget, the picker still shows the green "Add" button instead of "✓ Added"
- `placedWidgetIds` might not update reactively after adding
- The fix from Phase 1 (computing from all breakpoints + resolving to plugin IDs) may not be working correctly with the home-store
- Could also be a timing issue — store updates after the picker checks

### Bug 3: Presets always show "Apply" with no feedback
- After applying a preset, the button still says "Apply" with no visual confirmation
- Should show "✓ Applied" or disable the button, or flash green
- No animation when widgets appear after applying a preset

### Bug 4: No animations when adding widgets
- Widgets just appear instantly when added from the picker
- Should have a subtle entrance animation (fade in, scale up, or slide in)
- CSS `@keyframes` entry animation on new grid items

### Bug 5: Should allow duplicate widgets
- Currently the picker shows "✓ Added" and disables the button after placing one instance
- User wants to place multiple instances of the same widget (e.g., two Knowledge widgets with different configs)
- The `isAlreadyPlaced` check should be removed or made optional
- Each instance already has a unique ID (`pluginId-uuid8`), so duplicates are architecturally supported

### Bug 6: Layout is ugly after adding multiple widgets
- Widgets stack poorly — overlapping, misaligned, or creating awkward gaps
- The `y: Infinity` placement strategy pushes widgets to the bottom but doesn't optimize layout
- Need better auto-placement: find first available gap in the grid, or use react-grid-layout's compact algorithm more aggressively
- Preset layouts should look clean on first apply (hand-tuned positions per breakpoint)

### Bug 7: Delete page confirmation requires scrolling
- Right-clicking a tab and choosing "Delete page" opens a confirmation dialog/element that's below the viewport
- User has to scroll down to see and click the confirmation
- Should be a centered modal dialog or inline confirmation near the tab, not at the bottom of the page

### Bug 8: Widgets disappear when switching back to Home tab
- Create a new page tab → switch back to Home tab → widgets are gone (empty grid)
- Widgets only reappear after navigating away from the entire Dashboard module and coming back
- Likely an `activePageId` state issue — switching tabs doesn't trigger a re-render of the grid, or the page lookup fails after adding a new page
- Could be that `useDashboardStore()` returns stale state when `activePageId` changes

### Bug 9: "No data" widget on Dashboard Home
- Screenshot shows a random "No data — Configure a value or data series" widget card on the Home tab
- This is a primitive widget (StatCard or LineChart) that got placed without any data source configured
- Should either not appear by default, or show a more helpful empty state

## Solution

Priority order:
1. Fix resize (Bug 1) — critical, blocks all customization
2. Fix widgets disappearing on tab switch (Bug 8) — critical, broken navigation
3. Remove duplicate restriction (Bug 5) — quick win
4. Fix "Added" state (Bug 2) — misleading UX
5. Fix delete confirmation position (Bug 7) — UX
6. Remove stale "No data" widget (Bug 9) — cleanup
7. Add entry animations (Bug 4) — polish
8. Fix preset feedback (Bug 3) — polish
9. Improve auto-placement (Bug 6) — quality
