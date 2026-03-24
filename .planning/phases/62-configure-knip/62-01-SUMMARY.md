---
phase: 62-configure-knip
plan: 01
subsystem: infra
tags: [knip, dead-code, static-analysis, vite, react]

# Dependency graph
requires: []
provides:
  - "knip v6 configured with 83 entry points covering all dynamic imports"
  - "Dead code analysis identifying 14 unused files, 57 unused exports, 36 unused types"
  - "Baseline for phases 63-68 dead code removal"
affects: [63-remove-unused-files, 64-remove-unused-exports, 65-remove-unused-types, 66-remove-unused-dependencies]

# Tech tracking
tech-stack:
  added: [knip]
  patterns: [knip-entry-points-for-lazy-imports]

key-files:
  created:
    - frontend/knip.json
  modified:
    - frontend/package.json

key-decisions:
  - "Excluded 6 entry points for files from future phases (TerminalWidget, ClaudeSessionsWidget, VncPreviewWidget, OpenClawKpiWidget, SessionHistoryPanel, SkillsTab)"
  - "Removed redundant ignore/ignoreDependencies that knip auto-detects via built-in plugins"
  - "Kept @tauri-apps and @types/dompurify,lz-string as defensive ignoreDependencies"

patterns-established:
  - "Entry points pattern: all React.lazy targets, widget registry component factories, and primitive register.ts imports must be listed as knip entry points"

requirements-completed: [DEV-03]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 62 Plan 01: Configure Knip Summary

**Knip v6 installed and configured with 83 entry points, identifying 14 unused files, 57 unused exports, and 36 unused types for dead code removal**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T09:11:08Z
- **Completed:** 2026-03-24T09:14:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Installed knip v6 as devDependency with zero false positives on dynamically-imported files
- Created knip.json with 83 entry points covering all lazy-loaded pages, widgets, wizard steps, settings panels, OpenClaw tabs, primitives, and lazy-loaded modals
- Validated knip produces actionable dead code findings: 14 unused files, 57 unused exports, 36 unused types, 1 unused dependency (tailwindcss), 1 unlisted dependency (react-resizable)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install knip and create knip.json with all entry points** - `31c0681` (chore)
2. **Task 2: Validate knip runs with zero false positives on known-used files** - `66c15ce` (chore)

## Files Created/Modified
- `frontend/knip.json` - Knip configuration with 83 entry points, ignoreDependencies for Tauri externals and type-only packages
- `frontend/package.json` - Added knip ^6.0.4 as devDependency

## Decisions Made
- Excluded 6 entry points for files from future phases that don't exist yet (TerminalWidget, ClaudeSessionsWidget, VncPreviewWidget, OpenClawKpiWidget, SessionHistoryPanel, SkillsTab) -- these should be added when the files are created
- Removed redundant knip config entries (ignore patterns, most ignoreDependencies) that knip's built-in plugins auto-detect via Vite/ESLint/Vitest plugins
- Kept @tauri-apps packages as defensive ignoreDependencies since they're externalized in rollupOptions and dynamically imported
- `src/main.tsx` removed from entry array since knip auto-detects it as Vite entry point

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed entry points for non-existent files**
- **Found during:** Task 1 (creating knip.json)
- **Issue:** Plan listed 6 entry points for files from future phases (phases 13-18) that don't exist in the current codebase
- **Fix:** Removed TerminalWidget.tsx, ClaudeSessionsWidget.tsx, VncPreviewWidget.tsx, OpenClawKpiWidget.tsx, SessionHistoryPanel.tsx, SkillsTab.tsx from entry array
- **Files modified:** frontend/knip.json
- **Verification:** knip runs without errors
- **Committed in:** 31c0681 (Task 1 commit)

**2. [Rule 3 - Blocking] Removed @types/novnc__novnc from ignoreDependencies**
- **Found during:** Task 1 (creating knip.json)
- **Issue:** @types/novnc__novnc is not in package.json devDependencies
- **Fix:** Removed from ignoreDependencies list
- **Files modified:** frontend/knip.json
- **Verification:** knip runs without errors
- **Committed in:** 31c0681 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to prevent knip from crashing on missing files/packages. No scope creep.

## Issues Encountered
None

## Known Stubs
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- knip output provides exact list of dead code for phases 63-68 to remove
- Key findings: 14 unused files (including Status.tsx page and its subcomponents, database.types.ts, tauri.d.ts), 57 unused exports, 36 unused exported types
- tailwindcss flagged as unused dependency (likely real since the project uses CSS variables, not Tailwind utility classes)
- react-resizable flagged as unlisted dependency (imported in DashboardGrid.tsx but missing from package.json)

## Self-Check: PASSED

- frontend/knip.json: FOUND
- 62-01-SUMMARY.md: FOUND
- Commit 31c0681: FOUND
- Commit 66c15ce: FOUND

---
*Phase: 62-configure-knip*
*Completed: 2026-03-24*
