# Deferred Items - Phase 02.1

## Pre-existing Test Failures

The following tests reference legacy `var(--green)` / `var(--green-400)` values that were changed to `var(--secondary)` by Plan 02.1-03 (green-to-secondary migration). The tests were not updated during that plan.

1. `src/pages/missions/__tests__/utils.test.ts` - `statusColor` returns `var(--secondary)` instead of expected `var(--green-400)` for "done" status
2. `src/pages/pipeline/__tests__/types.test.ts` - 3 test cases expect `var(--green)` but get `var(--secondary)`:
   - `STALE_TYPE_COLORS > todo uses green color`
   - `IDEA_LEVEL_COLORS > maps low to green`
   - `IDEA_STATUS_META > approved has green color`

**Fix:** Update test expectations from `var(--green)` / `var(--green-400)` to `var(--secondary)`.
**Not fixed in 02.1-04:** These are pre-existing failures outside the scope of the Display page redesign.
