---
phase: 73-widget-render-smoke-test
plan: 01
subsystem: testing
tags: [vitest, react, widget-registry, smoke-test, jsdom]

requires:
  - phase: 63-dead-code-cleanup
    provides: cleaned widget registry after dead code removal

provides:
  - Smoke test that renders all 29 BUILTIN_WIDGETS and catches dangling imports
  - Registry integrity check verifying all component() factories resolve
  - Dangling reference check for deleted components (VncPreview, ProjectTracker, TipTap, novnc)

affects: [dashboard, widget-registry]

tech-stack:
  added: []
  patterns: [widget-smoke-test-pattern, importOriginal-mock-pattern]

key-files:
  created:
    - frontend/src/lib/__tests__/widget-render-smoke.test.tsx
  modified:
    - frontend/src/lib/__tests__/widget-registry.test.ts

key-decisions:
  - "Used importOriginal for demo-data mock to avoid manually listing all 16+ exports"
  - "Mock api module globally rather than individual hooks for simpler maintenance"
  - "Test renders each widget in isolation with its own QueryClient to prevent cross-test leakage"

patterns-established:
  - "Widget smoke test pattern: mock api + demo-data + useRealtimeSSE, provide QueryClientProvider + MemoryRouter wrapper, iterate BUILTIN_WIDGETS with async component() resolution"

requirements-completed: [VERIFY-02]

duration: 7min
completed: 2026-03-24
---

# Phase 73: Widget Render Smoke Test Summary

**Smoke test for all 29 BUILTIN_WIDGETS verifying lazy component factories resolve and render without errors in jsdom**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T11:22:17Z
- **Completed:** 2026-03-24T11:30:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created comprehensive smoke test covering all 29 dashboard widgets
- Fixed 3 stale assertions in existing widget-registry.test.ts (pre-existing drift from code changes)
- Verified no dangling references to VncPreviewWidget or other deleted components exist
- All component() lazy-load factories resolve without import errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove vnc-viewer dangling reference and delete VncPreviewWidget** - `078e8e0` (fix)
2. **Task 2: Write widget render smoke test** - `ea72fe6` (test)

## Files Created/Modified
- `frontend/src/lib/__tests__/widget-render-smoke.test.tsx` - New: 31 tests (2 structural + 29 per-widget render checks)
- `frontend/src/lib/__tests__/widget-registry.test.ts` - Fixed: stale length/bundle/preset assertions

## Decisions Made
- Used `importOriginal` pattern for `@/lib/demo-data` mock to avoid manually re-exporting all 16+ constants -- future demo-data changes won't break the smoke test
- Mocked `@/lib/api` at module level rather than individual dashboard hooks for simpler maintenance
- Each widget render test creates a fresh `QueryClient` (via the TestWrapper) to prevent cross-test state leakage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale widget-registry.test.ts assertions**
- **Found during:** Task 1
- **Issue:** Plan assumed 33 widgets with vnc-viewer still present. Actual state: 29 widgets, VncPreviewWidget already deleted, vnc-viewer entry already removed. The existing test had stale assertions (expected 28 widgets, Media Suite without music-now-playing, Media Center with 3 widgets instead of 4)
- **Fix:** Updated BUILTIN_WIDGETS length from 28 to 29, Media Suite bundle to include music-now-playing, Media Center preset count from 3 to 4
- **Files modified:** frontend/src/lib/__tests__/widget-registry.test.ts
- **Verification:** All 32 existing registry tests pass
- **Committed in:** 078e8e0

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Task 1 was a no-op for its primary goal (VncPreviewWidget already deleted by Phase 63) but the test assertion sync was still needed. No scope creep.

## Issues Encountered
- Plan was written against stale codebase state -- VncPreviewWidget.tsx was already deleted and vnc-viewer registry entry already removed before this phase executed. Adapted by fixing the stale test assertions instead.
- 2 pre-existing test failures in unrelated files (wizard-store.test.ts, BjornModules.test.tsx) -- not caused by this phase's changes, not addressed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Widget render smoke test provides ongoing regression protection for dashboard widget registry
- Any future widget additions or deletions will be caught by the factory resolution test
- Pre-existing test failures in wizard-store and BjornModules should be addressed in a future phase

## Self-Check: PASSED

- FOUND: frontend/src/lib/__tests__/widget-render-smoke.test.tsx
- FOUND: frontend/src/lib/__tests__/widget-registry.test.ts
- FOUND: .planning/phases/73-widget-render-smoke-test/73-01-SUMMARY.md
- FOUND: commit 078e8e0
- FOUND: commit ea72fe6

---
*Phase: 73-widget-render-smoke-test*
*Completed: 2026-03-24*
