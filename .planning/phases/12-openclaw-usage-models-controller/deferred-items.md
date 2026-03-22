# Deferred Items - Phase 12

## Pre-existing Test Failures (Out of Scope)

The following test failures exist in the working tree due to uncommitted phase 13 (Koel music widget) changes that were lost when git refs became corrupted by NFS/mergerfs:

1. **widget-registry.test.ts** (3 failures) - Registry expects 28 widgets but finds 29 (MusicNowPlayingWidget added to widget-registry.ts)
2. **wizard-store.test.ts** (1 failure) - PRESET_BUNDLES includes music widget not in test expectations
3. **DashboardGrid.test.tsx** (1 failure) - Grid layout test affected by widget count change
4. **DashboardIntegration.test.tsx** (1 failure) - Integration test affected by widget count change
5. **WidgetWrapper.test.tsx** (1 failure) - Widget lookup test affected by new widget
6. **BjornModules.test.tsx** (1 failure) - Settings module test affected by module count change

**Root cause:** Phase 13 session modified `widget-registry.ts`, `CommandPalette.tsx`, `GlobalSearch.tsx`, `lib/types.ts`, and `lib/hooks/dashboard/index.ts` but the commit was lost when git HEAD ref was corrupted. The working tree has these changes but they were never committed.

**Resolution:** These should be addressed when phase 13 work is re-executed. The working tree files can either be committed as-is (if correct) or reverted and redone.
