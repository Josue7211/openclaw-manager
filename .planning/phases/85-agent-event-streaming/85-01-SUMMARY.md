---
phase: 85-agent-event-streaming
plan: 01
subsystem: ui
tags: [react-query, sse, gateway, real-time, agents]

requires:
  - phase: 84-sse-event-bus-wiring
    provides: useGatewaySSE hook and event-bus gateway event types
provides:
  - useAgents hook with real-time gateway agent event subscription
  - AgentsPage with gateway events feed invalidation
  - aria-live accessibility on agent status region
affects: [86-session-event-streaming, 90-live-activity-feed]

tech-stack:
  added: []
  patterns:
    - "useGatewaySSE wiring pattern: hook-level invalidation for entity queries, page-level invalidation for activity feed"
    - "Demo mode: pass empty options to useGatewaySSE instead of conditional hook call (rules-of-hooks compliance)"

key-files:
  created: []
  modified:
    - frontend/src/hooks/useAgents.ts
    - frontend/src/hooks/__tests__/useAgents.test.ts
    - frontend/src/pages/Agents.tsx

key-decisions:
  - "Used queryKeys.gatewayEvents instead of plan's queryKeys.gatewayActivity (the actual key name after Phase 84)"
  - "Always call useGatewaySSE with empty options in demo mode rather than conditional hook call -- React rules of hooks compliance"
  - "Separated concerns: useAgents invalidates queryKeys.agents, AgentsPage invalidates queryKeys.gatewayEvents"

patterns-established:
  - "Gateway SSE wiring: hook invalidates entity query, page invalidates activity feed"

requirements-completed: [EVT-02]

duration: 3min
completed: 2026-03-24
---

# Phase 85 Plan 01: Agent Event Streaming Summary

**Real-time agent status updates via gateway SSE with React Query cache invalidation and aria-live accessibility**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T15:53:33Z
- **Completed:** 2026-03-24T15:57:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- useAgents hook subscribes to gateway `agent` events, automatically refetching agent list on status changes
- AgentsPage separately invalidates gateway events feed for activity tracking
- AgentCard status region confirmed with aria-live="polite" for screen reader announcements
- 2 new tests added and all 12 useAgents tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire useGatewaySSE into useAgents hook** - `86e4134` (feat) -- TDD: RED `12485a1`, GREEN `86e4134`
2. **Task 2: Add useGatewaySSE to AgentsPage + verify aria-live** - `24eb7ea` (feat)

## Files Created/Modified
- `frontend/src/hooks/useAgents.ts` - Added useGatewaySSE import and subscription for agent events
- `frontend/src/hooks/__tests__/useAgents.test.ts` - Added 2 SSE integration tests and useGatewaySSE mock
- `frontend/src/pages/Agents.tsx` - Added useGatewaySSE subscription for activity feed invalidation

## Decisions Made
- Used `queryKeys.gatewayEvents` instead of plan's `queryKeys.gatewayActivity` -- the actual key name after Phase 84 was `gatewayEvents`, not `gatewayActivity`
- Always call useGatewaySSE (even in demo mode with empty options) to comply with React rules of hooks -- conditional hook calls cause runtime errors
- Separated invalidation concerns: useAgents hook handles entity-level cache (`queryKeys.agents`), AgentsPage handles feed-level cache (`queryKeys.gatewayEvents`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected query key name from gatewayActivity to gatewayEvents**
- **Found during:** Task 2 (AgentsPage SSE subscription)
- **Issue:** Plan referenced `queryKeys.gatewayActivity` but the actual key created by Phase 84 is `queryKeys.gatewayEvents`
- **Fix:** Used the correct key `queryKeys.gatewayEvents`
- **Files modified:** frontend/src/pages/Agents.tsx
- **Verification:** grep confirms gatewayEvents present in Agents.tsx
- **Committed in:** 24eb7ea

**2. [Rule 1 - Bug] Used unconditional hook call pattern instead of conditional**
- **Found during:** Task 1 (useAgents SSE wiring)
- **Issue:** Plan suggested wrapping useGatewaySSE in `if (!isDemoMode())` guard, but conditional hook calls violate React rules of hooks
- **Fix:** Always call useGatewaySSE, passing empty options `{}` in demo mode (no-op) instead of skipping the call
- **Files modified:** frontend/src/hooks/useAgents.ts, frontend/src/pages/Agents.tsx
- **Verification:** Tests pass, no rules-of-hooks violations
- **Committed in:** 86e4134, 24eb7ea

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 86 (Session Event Streaming) can follow the same wiring pattern established here
- Phase 90 (Live Activity Feed) will consume the queryKeys.gatewayEvents that this phase keeps fresh

## Self-Check: PASSED

All files exist. All commits verified (12485a1, 86e4134, 24eb7ea).

---
*Phase: 85-agent-event-streaming*
*Completed: 2026-03-24*
