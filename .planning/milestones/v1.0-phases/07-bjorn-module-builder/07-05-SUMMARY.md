---
phase: 07-bjorn-module-builder
plan: 05
subsystem: ui
tags: [react, ai-chat, bjorn, module-builder, system-prompt, primitives-api, code-extraction]

# Dependency graph
requires:
  - phase: 07-01
    provides: BjornModule types, BjornGenerationState, static analysis
  - phase: 07-03
    provides: BjornPreview sandboxed iframe component
  - phase: 07-04
    provides: bjorn-store CRUD, saveBjornModule, blob URL hot-reload
provides:
  - BjornTab chat + preview split layout component
  - BjornApprovalBar approve/reject/edit toolbar
  - buildBjornSystemPrompt with all 11 primitive schemas
  - extractCodeFromResponse for markdown code fence parsing
  - extractModuleMetadata for name/description extraction
  - Chat page tab switcher (Chat / Bjorn tabs)
affects: [07-06, settings-modules]

# Tech tracking
tech-stack:
  added: []
  patterns: [bjorn-system-prompt-builder, code-fence-extraction, chat-tab-switcher]

key-files:
  created:
    - frontend/src/pages/chat/bjorn-prompt.ts
    - frontend/src/pages/chat/BjornApprovalBar.tsx
    - frontend/src/pages/chat/BjornTab.tsx
    - frontend/src/pages/chat/__tests__/BjornTab.test.tsx
  modified:
    - frontend/src/pages/Chat.tsx

key-decisions:
  - "BjornTab uses own message state (not useChatState) for separate conversation context"
  - "System prompt sent as system_prompt field on each api.post to /api/chat for Bjorn-specific prompting"
  - "Tab switcher as segmented control in header bar next to PageHeader, not separate nav"
  - "Chat state kept alive in parent when switching to Bjorn tab (useChatState in ChatPage, not unmounted)"

patterns-established:
  - "Chat tab switcher: segmented control with aria-pressed for tab state"
  - "Code extraction: regex match on javascript/jsx/tsx/plain code fences"
  - "Metadata extraction: regex patterns for conversational module naming"

requirements-completed: [BJORN-01, BJORN-02, BJORN-05]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 07 Plan 05: Bjorn Chat Tab Summary

**Bjorn chat tab with side-by-side preview, system prompt with all 11 primitive schemas, approve/reject/edit approval bar, and Chat page tab switcher**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T05:55:03Z
- **Completed:** 2026-03-21T05:59:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built Bjorn system prompt containing all 11 primitive config schemas (StatCard, ProgressGauge, MarkdownDisplay, LineChart, BarChart, ListView, DataTable, FormWidget, KanbanBoard, TimerCountdown, ImageGallery)
- Created BjornTab with chat + preview split layout, generation state machine, and approval flow (approve saves module, reject discards, edit re-focuses input)
- Added Chat page tab switcher between Chat and Bjorn tabs with lazy-loaded BjornTab
- 20 integration tests covering prompt builder, code extraction, metadata parsing, and approval bar state

## Task Commits

Each task was committed atomically:

1. **Task 1: Bjorn system prompt builder + approval bar + tab component** - `14e043f` (feat)
2. **Task 2: Chat page tab integration + BjornTab tests** - `b48333b` (feat)

## Files Created/Modified
- `frontend/src/pages/chat/bjorn-prompt.ts` - System prompt builder with 11 primitive schemas, code extraction, metadata parsing
- `frontend/src/pages/chat/BjornApprovalBar.tsx` - Approve/reject/edit toolbar below preview
- `frontend/src/pages/chat/BjornTab.tsx` - Side-by-side chat + preview layout with generation state machine
- `frontend/src/pages/Chat.tsx` - Added tab switcher (Chat/Bjorn), lazy-loaded BjornTab
- `frontend/src/pages/chat/__tests__/BjornTab.test.tsx` - 20 tests for prompt, extraction, approval bar

## Decisions Made
- BjornTab uses its own message state separate from useChatState to keep Bjorn conversations independent from regular chat
- System prompt sent as `system_prompt` field in the api.post body to leverage existing /api/chat endpoint with specialized prompting
- Tab switcher placed as segmented control next to PageHeader in header bar (not a separate navigation mechanism)
- Chat state (useChatState) stays alive in parent component when switching to Bjorn tab, preserving WebSocket connection and message history

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bjorn chat + preview + approval pipeline complete and wired together
- Ready for Phase 07-06 (Settings modules management for Bjorn modules)
- All 11 primitive schemas embedded in system prompt for Bjorn code generation

## Self-Check: PASSED

- All 5 files verified on disk
- Commit 14e043f verified in git log
- Commit b48333b verified in git log
- 27 tests passing (20 BjornTab + 7 BjornPreview)

---
*Phase: 07-bjorn-module-builder*
*Completed: 2026-03-21*
