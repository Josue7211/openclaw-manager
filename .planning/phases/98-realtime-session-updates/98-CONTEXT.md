# Phase 98: Real-time Session List Updates - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous mode)

<domain>
## Phase Boundary

The session list stays current without manual refresh. When a new session is created (first message sent), it appears in the list. When messages arrive in any session, that session's last activity and message count update live. The currently selected session remains stable during updates. SSE 'chat' events trigger updates (no polling).

</domain>

<decisions>
## Implementation Decisions

### SSE-Driven Updates
- `'chat'` SSE events already invalidate `queryKeys.gatewaySessions` via useGatewaySSE
- This may already work from Phase 91's wiring — verify and enhance if needed
- Additional event parsing may be needed to extract session metadata from chat events

### Selection Stability
- When the session list re-renders due to updates, the currently selected session must remain selected
- Use the session `key` as the stable reference (not array index)
- React Query's structural sharing ensures stable references for unchanged sessions

### New Session Appearance
- After `chat.send` creates a new session, invalidate `queryKeys.gatewaySessions`
- The new session should appear at the top of the list (sorted by lastActivity)
- Auto-select the new session after creation

### Message Count Updates
- Each `'chat'` event for a session should increment that session's message count
- Can be done via optimistic cache update or full refetch (refetch is simpler and fine for <100 sessions)

### Claude's Discretion
- Whether to show a subtle animation when a session's metadata updates
- Debounce strategy for rapid chat events (avoid excessive refetches)
- Whether to show "New" badge on sessions with unread messages

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useGatewaySSE` — already wired to invalidate queries on events
- `queryKeys.gatewaySessions` — cache key for session list
- `useGatewaySessions` hook — fetches session list with 5s stale time and refetch interval
- SSE 'chat' event already mapped in `GATEWAY_EVENT_MAP`

### Integration Points
- May need to add `queryKeys: { chat: queryKeys.gatewaySessions }` to useGatewaySSE config
- Verify selection stability in SessionsPage when list updates
- Ensure new session from chat.send triggers list refresh

</code_context>

<specifics>
## Specific Ideas

- This phase may be partially done if Phase 91's SSE wiring already invalidates the sessions query on chat events. Verify first, then fill gaps.

</specifics>

<deferred>
## Deferred Ideas

- Unread message counts per session
- Session grouping by date

</deferred>
