# Test Coverage Baseline

**Date:** 2026-03-15
**Tool:** vitest 4.1.0 + @vitest/coverage-v8
**Config:** `frontend/vitest.config.ts` with `coverage.all: true`

## Coverage Summary

| Metric     | Covered | Total | Percentage |
|------------|---------|-------|------------|
| Statements | 271     | 8,711 | 3.11%      |
| Branches   | 105     | 6,785 | 1.54%      |
| Functions  | 56      | 2,358 | 2.37%      |
| Lines      | 237     | 7,285 | 3.25%      |

## Test Suite Summary

- **Test files:** 12 (all passing)
- **Total tests:** 90 (all passing)
- **Duration:** ~1.6s

## Files with 100% Coverage

| File | Lines |
|------|-------|
| `src/hooks/messages/shared.ts` | 4 |
| `src/lib/audio.ts` | 38 |
| `src/lib/migrations.ts` | 9 |
| `src/lib/page-cache.ts` | 9 |
| `src/lib/hooks/useEscapeKey.ts` | 6 |
| `src/lib/hooks/useLocalStorageState.ts` | 11 |

## Files with Partial Coverage

| File | Lines % | Stmts % | Notes |
|------|---------|---------|-------|
| `src/lib/modules.ts` | 94.44% | 91.30% | Missing `notifyModulesChanged` |
| `src/lib/redact.ts` | 88.88% | 80.00% | 1 uncovered line |
| `src/lib/api.ts` | 85.71% | 84.61% | Missing offline queue, retry paths |
| `src/lib/error-reporter.ts` | 55.55% | 60.00% | Missing error handling branches |
| `src/lib/keybindings.ts` | 51.19% | 47.11% | Modifier management, key event handlers untested |
| `src/lib/sidebar-settings.ts` | 48.93% | 44.64% | Only header visibility tested |
| `src/lib/utils.ts` | 29.54% | 30.50% | Only timeAgo/formatTime tested |

## Files with 0% Coverage (by uncovered lines, descending)

These are the largest untested files, sorted by number of uncovered lines:

| File | Uncovered Lines | Category |
|------|-----------------|----------|
| `src/pages/Settings.tsx` | 1,145 | Page |
| `src/pages/Messages.tsx` | 663 | Page |
| `src/components/Sidebar.tsx` | 330 | Component |
| `src/pages/Pomodoro.tsx` | 293 | Page |
| `src/pages/Pipeline.tsx` | 280 | Page |
| `src/pages/Chat.tsx` | 261 | Page |
| `src/pages/Missions.tsx` | 248 | Page |
| `src/pages/Dashboard.tsx` | 228 | Page |
| `src/components/CommandPalette.tsx` | 189 | Component |
| `src/pages/Login.tsx` | 184 | Page |
| `src/lib/sidebar-config.ts` | 179 | Lib |
| `src/components/OnboardingWelcome.tsx` | 155 | Component |
| `src/pages/Email.tsx` | 155 | Page |
| `src/components/ResizablePanel.tsx` | 153 | Component |
| `src/pages/Calendar.tsx` | 141 | Page |
| `src/pages/Personal.tsx` | 141 | Page |
| `src/components/NotificationCenter.tsx` | 131 | Component |
| `src/pages/CronJobs.tsx` | 123 | Page |
| `src/hooks/messages/useConversationList.ts` | 93 | Hook |
| `src/hooks/messages/useMessageCompose.ts` | 92 | Hook |
| `src/hooks/messages/useMessagesSSE.ts` | 88 | Hook |
| `src/components/LayoutShell.tsx` | 85 | Component |
| `src/pages/Reminders.tsx` | 82 | Page |
| `src/pages/Agents.tsx` | 80 | Page |
| `src/pages/Capture.tsx` | 76 | Page |
| `src/main.tsx` | 76 | Entry |
| `src/pages/KnowledgeBase.tsx` | 74 | Page |
| `src/components/GlobalSearch.tsx` | 74 | Component |
| `src/pages/Todos.tsx` | 71 | Page |
| `src/lib/hooks/useChatSocket.ts` | 66 | Hook |
| `src/components/messages/ContactAvatar.tsx` | 62 | Component |
| `src/lib/preferences-sync.ts` | 59 | Lib |
| `src/pages/Status.tsx` | 56 | Page |
| `src/components/Lightbox.tsx` | 55 | Component |
| `src/components/messages/AudioWaveform.tsx` | 49 | Component |
| `src/lib/themes.ts` | 49 | Lib |
| `src/lib/hooks/usePageTitle.ts` | 43 | Hook |
| `src/lib/offline-queue.ts` | 36 | Lib |
| `src/pages/Search.tsx` | 31 | Page |
| `src/lib/hooks/useTodos.ts` | 30 | Hook |

## Top 3 Files for Maximum Coverage Improvement

These are pure logic/utility files (not React components) that would give the best
coverage-per-effort ratio since they don't require component rendering infrastructure:

1. **`src/lib/sidebar-config.ts`** (179 uncovered lines)
   - Pure state management module (useSyncExternalStore pattern)
   - Similar architecture to already-tested `keybindings.ts` and `modules.ts`
   - Functions: section reordering, sidebar customization, drag/rename logic
   - Estimated impact: +2.5% lines coverage

2. **`src/lib/themes.ts`** (49 uncovered lines)
   - Theme definitions and switching logic
   - Pure functions, no React dependencies
   - Estimated impact: +0.7% lines coverage

3. **`src/lib/utils.ts`** (31 uncovered lines remaining)
   - Already partially tested (timeAgo, formatTime)
   - Remaining: `formatBytes`, `truncate`, `debounce`, `cn` (classNames merger)
   - Easy to test, pure utility functions
   - Estimated impact: +0.4% lines coverage

**Combined estimated impact of testing all 3:** ~3.6% lines coverage increase
(from 3.25% to ~6.85%)

## Notes

- Coverage provider `@vitest/coverage-v8` was installed as part of this baseline
- `src/lib/tauri.ts` is excluded from coverage due to a rolldown parse error
  (TypeScript-only file that the v8 coverage parser cannot handle)
- The `coverage.all: true` setting ensures uncovered files are included in the report
- Coverage configuration added to `frontend/vitest.config.ts`
- 5 pre-existing test failures were fixed during this baseline:
  - `keybindings.test.ts`: `updateKeybinding` signature changed from `(id, key)` to `(id, {key})`
  - `keybindings.test.ts`: `formatKey` now uses stored modifier (not platform detection)
  - `modules.test.ts`: `getEnabledModules` reads cached value from module init, not live localStorage
