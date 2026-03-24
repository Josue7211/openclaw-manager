---
phase: 65-strip-unused-file-exports
plan: 01
subsystem: frontend/lib
tags: [dead-code, cleanup, exports]
dependency_graph:
  requires: []
  provides: [clean-barrel-exports, clean-store-exports]
  affects: [frontend/src/lib/hooks/dashboard/index.ts, frontend/src/lib/dashboard-store.ts, frontend/src/lib/dashboard-defaults.ts, frontend/src/lib/home-store.ts, frontend/src/lib/home-defaults.ts, frontend/src/lib/theme-engine.ts, frontend/src/lib/theme-store.ts, frontend/src/lib/theme-scheduling.ts, frontend/src/lib/tour-store.ts, frontend/src/lib/sidebar-config.ts, frontend/src/lib/animation-intensity.ts, frontend/src/lib/google-fonts.ts]
tech_stack:
  added: []
  patterns: [de-export-unused, delete-dead-functions]
key_files:
  created: []
  modified:
    - frontend/src/lib/hooks/dashboard/index.ts
    - frontend/src/lib/dashboard-store.ts
    - frontend/src/lib/dashboard-defaults.ts
    - frontend/src/lib/home-store.ts
    - frontend/src/lib/home-defaults.ts
    - frontend/src/lib/theme-engine.ts
    - frontend/src/lib/theme-store.ts
    - frontend/src/lib/theme-scheduling.ts
    - frontend/src/lib/tour-store.ts
    - frontend/src/lib/sidebar-config.ts
    - frontend/src/lib/animation-intensity.ts
    - frontend/src/lib/google-fonts.ts
decisions: []
metrics:
  duration: 9min
  completed: 2026-03-24T09:42:00Z
  tasks: 2
  files: 12
---

# Phase 65 Plan 01: Strip Unused Dashboard/Store/Engine Exports Summary

Removed 39 unused exports (19 barrel re-exports + 20 store/engine functions/types) detected by knip. Zero tsc errors, zero knip findings on modified files.

## Changes

### Task 1: Dashboard barrel trimmed from 29 to 11 re-exports
- Removed 16 hook re-exports and 3 type re-exports from `hooks/dashboard/index.ts`
- All removed hooks are consumed via direct file imports (not through the barrel)
- Kept: `useAgentCacheSSE`, `useAgentStatus`, `useHeartbeat`, `useSessions`, `useSubagentData`, `useAgentsData`, `useMissions`, `useIdeas`, `useMemoryEntries`, `useKnowledgeWidget`, `usePomodoroWidget`
- Commit: 8f2ef9c

### Task 2: Store and engine exports cleaned across 11 files
- **dashboard-store.ts**: De-exported 4 functions (`setDotIndicatorsEnabled`, `reorderPages`, `resetPageLayout`, `resetAllLayouts`)
- **dashboard-defaults.ts**: De-exported 2 interfaces (`LayoutItem`, `DefaultLayoutResult`)
- **home-store.ts**: De-exported 4 functions (`subscribeHome`, `setHomeWobbleEnabled`, `redoHome`, `resetHomeLayout`), removed type re-export line
- **home-defaults.ts**: De-exported constant (`HOME_DEFAULT_ORDER`) and interface (`HomeDefaultLayoutResult`)
- **theme-engine.ts**: De-exported 2 functions (`mapGtkThemeToPreset`, `applyAdvancedOverrides`) and 1 interface (`SystemThemeInfo`) -- all used internally
- **theme-store.ts**: Deleted 2 unused functions (`getLastClickEvent`, `clearLastClickEvent`)
- **theme-scheduling.ts**: De-exported `stopScheduleTimer` (used internally by `startScheduleTimer`)
- **tour-store.ts**: De-exported 3 functions (`getTourState`, `subscribeTour`, `endTour`), deleted 2 unused functions (`isTourActive`, `startTour`)
- **sidebar-config.ts**: De-exported 4 interfaces (`SidebarCategory`, `CustomModule`, `DeletedItem`, `SidebarConfig`), deleted `getCollapsedCategories`
- **animation-intensity.ts**: De-exported `AnimationLevel` type, deleted `useAnimationIntensity` hook and stale `useSyncExternalStore` import
- **google-fonts.ts**: De-exported `GoogleFont` interface, deleted `isGoogleFontLoaded`
- Commit: 51d719c

## Verification

- `tsc --noEmit`: zero errors
- `npx knip --include exports,types`: zero findings for any modified file
- `npx vitest run`: 2241 passed, 5 failed (all 5 failures pre-existing, unrelated to this plan)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.
