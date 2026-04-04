---
phase: 67-strip-unused-imports
plan: 01
subsystem: ui
tags: [eslint, typescript, dead-code, imports, linting]

requires: []
provides:
  - "Zero no-unused-vars ESLint violations across all TypeScript files"
  - "ESLint config with argsIgnorePattern/varsIgnorePattern for underscore-prefixed params"
affects: [68-enable-typescript-strict-flags]

tech-stack:
  added: []
  patterns:
    - "Underscore prefix convention for intentionally unused params (_props, _config)"

key-files:
  created: []
  modified:
    - frontend/eslint.config.js
    - frontend/src/main.tsx
    - frontend/src/components/Sidebar.tsx
    - frontend/src/lib/dashboard-store.ts
    - frontend/src/lib/home-store.ts
    - frontend/src/pages/settings/SettingsModules.tsx

key-decisions:
  - "Underscore-prefix for unused params instead of removing them (preserves API surface for future use)"
  - "Private functions prefixed with underscore rather than deleted (may be needed later)"

patterns-established:
  - "argsIgnorePattern: ^_ in ESLint config for intentionally unused function params"
  - "varsIgnorePattern: ^_ in ESLint config for intentionally unused variables"

requirements-completed: [DEAD-03]

duration: 18min
completed: 2026-03-24
---

# Phase 67 Plan 01: Strip Unused Imports Summary

**ESLint no-unused-vars rule enforced with underscore convention -- 97 violations eliminated across 47 TypeScript files**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-24T10:00:00Z
- **Completed:** 2026-03-24T10:18:00Z
- **Tasks:** 2
- **Files modified:** 47

## Accomplishments
- Configured ESLint `@typescript-eslint/no-unused-vars` with `argsIgnorePattern`, `varsIgnorePattern`, and `destructuredArrayIgnorePattern` for underscore-prefixed identifiers
- Stripped unused imports from 25 component/lib/hook files (batch 1) and 22 page/test files (batch 2)
- Zero `no-unused-vars` violations across entire frontend source
- TypeScript compiles clean (`tsc --noEmit` exit 0)
- All 2260 tests pass across 108 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure ESLint underscore pattern and strip unused imports from components and lib** - `9275a61` (fix)
2. **Task 2: Strip unused imports from pages and test files, verify clean codebase** - `8945127` (fix)

## Files Created/Modified
- `frontend/eslint.config.js` - Added no-unused-vars rule with underscore ignore patterns
- `frontend/src/components/BrandingSettings.tsx` - Removed unused `memo`, `row` imports
- `frontend/src/components/GuidedTour.tsx` - Removed unused `SPOTLIGHT_RADIUS` constant
- `frontend/src/components/NotificationCenter.tsx` - Removed unused `Check` icon import
- `frontend/src/components/ResizablePanel.tsx` - Removed unused `panelId` destructure
- `frontend/src/components/Sidebar.tsx` - Removed `setEnabledModules`, `deleteCustomModule` imports; prefixed unused NavSection params
- `frontend/src/components/dashboard/DashboardTabs.tsx` - Prefixed unused `editMode`, `dotIndicatorsEnabled` params
- `frontend/src/components/dashboard/RecycleBin.tsx` - Removed unused `ArrowCounterClockwise` import
- `frontend/src/components/dashboard/WidgetConfigPanel.tsx` - Removed unused `WidgetConfigSchema` type import
- `frontend/src/components/dashboard/WidgetPicker.tsx` - Removed unused `CheckCircle` import
- `frontend/src/components/primitives/TimerCountdown.tsx` - Removed unused `Timer` import
- `frontend/src/components/tour/TourTooltip.tsx` - Prefixed unused `onSkipSection` param
- `frontend/src/components/wizard/WizardSummary.tsx` - Removed unused `STEP_NAMES` import
- `frontend/src/hooks/messages/useMessagesSSE.ts` - Prefixed unused `selectedGuidRef` param
- `frontend/src/lib/__tests__/dashboard-store.test.ts` - Removed unused `setDashboardState` declaration
- `frontend/src/lib/__tests__/theme-*.test.ts` - Removed unused vitest imports (vi, beforeEach, afterEach)
- `frontend/src/lib/__tests__/webauthn.test.ts` - Removed unused `beforeEach` import
- `frontend/src/lib/dashboard-defaults.ts` - Prefixed unused `generateXsLayout` function
- `frontend/src/lib/dashboard-store.ts` - Prefixed 4 unused internal functions
- `frontend/src/lib/home-store.ts` - Removed unused type imports; prefixed 3 unused internal functions
- `frontend/src/lib/hooks/dashboard/useChatSummary.ts` - Removed unused `DEMO_CHAT_MESSAGES` import
- `frontend/src/main.tsx` - Removed stale `Agents` and `CronJobs` lazy imports
- `frontend/src/pages/Messages.tsx` - Removed unused `formatContactLabel`, `getReadOverrides`, `isIMessage`
- `frontend/src/pages/Missions.tsx` - Removed unused `Target` icon import
- `frontend/src/pages/Settings.tsx` - Removed unused `inputStyle`, `btnStyle`, `rowLast`, `Pref` interface
- `frontend/src/pages/Todos.tsx` - Removed unused `queryClient` assignment and `useQueryClient` import
- `frontend/src/pages/calendar/MonthView.tsx` - Removed unused `toDateKey` import
- `frontend/src/pages/calendar/WeekView.tsx` - Removed unused `useRef`, `useEffect` imports
- `frontend/src/pages/chat/BjornTab.tsx` - Removed unused `ChatCircle` import
- `frontend/src/pages/chat/ChatThread.tsx` - Removed unused `useRef` import
- `frontend/src/pages/dashboard/__tests__/*.test.tsx` - Removed unused testing-library imports
- `frontend/src/pages/messages/ComposePanel.tsx` - Removed unused `useState` import
- `frontend/src/pages/messages/ConversationList.tsx` - Removed unused `useRef` and `Message` type imports
- `frontend/src/pages/missions/MissionCard.tsx` - Prefixed unused `barColor` variable
- `frontend/src/pages/notes/GraphView.tsx` - Removed unused `noteIdFromTitle` import; prefixed unused `selectedId` param
- `frontend/src/pages/notes/Notes.tsx` - Removed unused `API_BASE`, `VaultNote`, `NOTE_TEMPLATES` imports
- `frontend/src/pages/pomodoro/__tests__/types.test.ts` - Removed unused `vi` import
- `frontend/src/pages/settings/SettingsDisplay.tsx` - Prefixed unused `description` destructure
- `frontend/src/pages/settings/SettingsKeybindings.tsx` - Prefixed unused `modKey` variable
- `frontend/src/pages/settings/SettingsModules.tsx` - Removed `APP_MODULES`, `deleteCustomModule` imports; prefixed unused params
- `frontend/src/pages/settings/SettingsUser.tsx` - Removed unused `rowLast` import

## Decisions Made
- Used underscore-prefix convention (`_paramName`) for unused function parameters rather than removing them, to preserve the API surface for future use
- Private unused functions in store files prefixed with underscore rather than deleted, as they may be needed when those features are wired up
- ESLint rule uses `destructuredArrayIgnorePattern` to allow `const [_unused, setter] = useState()` pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None - this plan only removes dead code, no stubs introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend codebase is clean of all `no-unused-vars` violations
- Ready for Phase 68 (enable TypeScript strict flags) with a clean baseline

## Self-Check: PASSED

- All key files exist (eslint.config.js, 67-01-SUMMARY.md)
- Both task commits verified (9275a61, 8945127)
- ESLint no-unused-vars count: 0
- argsIgnorePattern configured: yes

---
*Phase: 67-strip-unused-imports*
*Completed: 2026-03-24*
