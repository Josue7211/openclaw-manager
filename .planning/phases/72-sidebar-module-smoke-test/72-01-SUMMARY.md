---
phase: 72-sidebar-module-smoke-test
plan: 01
subsystem: testing
tags: [vitest, react, smoke-test, sidebar, modules]

requires:
  - phase: none
    provides: "standalone verification phase"
provides:
  - "Smoke test covering all 16 sidebar modules (import + render)"
  - "Guard test preventing silent module removal from APP_MODULES"
  - "Pattern for jsdom environment mocking (ResizeObserver, scrollIntoView)"
affects: [module-additions, sidebar-config, dead-code-removal]

tech-stack:
  added: []
  patterns:
    - "importOriginal for demo-data/dashboard-store mocks to preserve all exports"
    - "describe.each over APP_MODULES for per-module parametric testing"
    - "ResizeObserver and scrollIntoView stubs for jsdom environment"

key-files:
  created:
    - frontend/src/pages/__tests__/module-smoke.test.tsx
  modified: []

key-decisions:
  - "Tested 16 actual modules (not 20 as plan anticipated) since sessions/remote-viewer/approvals/activity modules do not exist in APP_MODULES yet"
  - "Used importOriginal pattern for demo-data and dashboard-store mocks to avoid enumerating all exports"
  - "Stubbed jsdom-missing APIs (ResizeObserver, Element.scrollIntoView) globally for all module renders"

patterns-established:
  - "Module smoke test pattern: iterate APP_MODULES, dynamic import, render in test wrapper, assert no error boundary"
  - "TestWrapper providing QueryClientProvider + MemoryRouter + ErrorBoundary + Suspense"

requirements-completed: [VERIFY-01]

duration: 9min
completed: 2026-03-24
---

# Phase 72 Plan 01: Sidebar Module Smoke Test Summary

**Vitest smoke test covering all 16 sidebar modules -- dynamic import + render verification with 34 passing tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-24T11:09:02Z
- **Completed:** 2026-03-24T11:18:41Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- All 16 APP_MODULES page components dynamically import without errors
- All 16 APP_MODULES page components render without triggering ErrorBoundary or PageErrorBoundary
- Guard test ensures APP_MODULES count stays >= 16 (catches accidental module removal)
- Coverage test ensures MODULE_PAGE_MAP covers every APP_MODULES entry

## Task Commits

Each task was committed atomically:

1. **Task 1: Create module smoke test** - `9d386ff` (test)

## Files Created/Modified
- `frontend/src/pages/__tests__/module-smoke.test.tsx` - Smoke test covering all 16 sidebar modules with 34 test cases (2 guard + 32 per-module)

## Decisions Made
- Plan anticipated 20 modules but APP_MODULES only has 16 entries. Four modules (sessions, remote-viewer, approvals, activity) do not exist yet. Tests cover the actual codebase state.
- Used `importOriginal` for `@/lib/demo-data` and `@/lib/dashboard-store` mocks since both export many constants and functions that are transitively imported by page components.
- Stubbed `ResizeObserver` (used by Pomodoro's ActivityHeatmap) and `Element.scrollIntoView` (used by Chat page) since jsdom does not implement these browser APIs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added comprehensive mock coverage for hook return shapes**
- **Found during:** Task 1
- **Issue:** Messages page's `useConversationList` hook returns 18+ properties (conversations, setConversations, contactLookup, filteredConversations, mutedConvs, pinnedConvs, etc.) -- the minimal mock from the plan was insufficient
- **Fix:** Expanded the `useConversationList` mock to return all required properties with appropriate defaults (empty arrays, Sets, vi.fn() callbacks)
- **Files modified:** frontend/src/pages/__tests__/module-smoke.test.tsx
- **Verification:** Messages module renders without error boundary
- **Committed in:** 9d386ff

**2. [Rule 3 - Blocking] Added jsdom environment stubs (ResizeObserver, scrollIntoView)**
- **Found during:** Task 1
- **Issue:** Pomodoro and Chat pages crash because jsdom lacks ResizeObserver and scrollIntoView
- **Fix:** Added global stubs: `vi.stubGlobal('ResizeObserver', ...)` and `Element.prototype.scrollIntoView = vi.fn()`
- **Files modified:** frontend/src/pages/__tests__/module-smoke.test.tsx
- **Verification:** Both modules render without error boundary
- **Committed in:** 9d386ff

**3. [Rule 3 - Blocking] Added useRealtimeSSE export to mock**
- **Found during:** Task 1
- **Issue:** Dashboard page transitively imports `useRealtimeSSE` from `@/lib/hooks/useRealtimeSSE` but mock only exported `useTableRealtime`
- **Fix:** Added `useRealtimeSSE: vi.fn()` to the mock
- **Files modified:** frontend/src/pages/__tests__/module-smoke.test.tsx
- **Verification:** Dashboard module renders without error boundary
- **Committed in:** 9d386ff

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)
**Impact on plan:** All fixes necessary for test correctness. No scope creep.

## Issues Encountered
- Pre-existing test failures in widget-registry.test.ts (3 tests), wizard-store.test.ts (1 test), and BjornModules.test.tsx (1 test) are unrelated to this plan. They existed before the smoke test was added.

## Known Stubs
None -- this is a test-only plan with no UI or data stubs.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Smoke test provides safety net for future module additions or dead code removal
- When new modules are added to APP_MODULES, they must also be added to MODULE_PAGE_MAP in the smoke test
- The guard test (>= 16) should be updated as modules are added

---
*Phase: 72-sidebar-module-smoke-test*
*Completed: 2026-03-24*
