# Phase 29: Session History View - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-generated (--auto flag, recommended defaults selected)

<domain>
## Phase Boundary

Add a chat-style message history view to the Sessions page. When a user clicks a session, show its message history from `sessions.history` gateway API in a scrollable conversation UI (right panel). This is a second view mode alongside the existing terminal output panel.

</domain>

<decisions>
## Implementation Decisions

### View Mode Toggle
- **D-01:** Add a tab/toggle in the right panel header: "Output" (terminal, existing) vs "History" (chat-style, new)
- **D-02:** Default to "History" tab for completed sessions, "Output" tab for running sessions
- **D-03:** Both tabs coexist — user can switch freely

### Message Display
- **D-04:** Reuse the existing ChatMessage bubble pattern from `pages/chat/ChatThread.tsx` — user messages right-aligned, assistant messages left-aligned
- **D-05:** Show role label (user/assistant), timestamp, and message content with markdown rendering
- **D-06:** Tool use blocks displayed as collapsible sections with tool name as header
- **D-07:** Auto-scroll to bottom on initial load, but don't force-scroll if user has scrolled up

### Data Fetching
- **D-08:** New `useSessionHistory(sessionId)` hook that calls `sessions.history` via gateway WS (similar to existing `useGatewaySessions` pattern)
- **D-09:** Fetch once on session select, cache in react-query, no polling needed (history is immutable for completed sessions)
- **D-10:** For running sessions, refetch every 5s to pick up new messages

### Empty/Error States
- **D-11:** "No history available" message when gateway returns empty or session has no history
- **D-12:** Show "Session not configured" when gateway is disconnected (consistent with other gateway-dependent features)

### Claude's Discretion
- Loading skeleton design for message history
- Exact spacing and typography for message bubbles
- How to handle very long messages (truncate vs full render)
- Message grouping (consecutive same-role messages)

</decisions>

<specifics>
## Specific Ideas

- Reuse the bubble alignment pattern from Chat page but keep it visually distinct (no input box, read-only history)
- Session metadata (task, model, duration) should show as a header card above the message list
- Match the existing split-pane resizable layout in SessionsPage

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above and ROADMAP.md phase description.

### Existing code patterns
- `frontend/src/pages/chat/ChatThread.tsx` — Message bubble component pattern
- `frontend/src/pages/chat/types.ts` — ChatMessage type, cleanText utility
- `frontend/src/pages/sessions/SessionOutputPanel.tsx` — Current right panel implementation
- `frontend/src/hooks/sessions/useGatewaySessions.ts` — Gateway data fetching pattern
- `src-tauri/src/routes/gateway.rs` — Gateway proxy + WS session communication

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatThread.tsx` — Message bubble rendering with user/assistant alignment
- `ChatMessage` type — role, text, timestamp, images
- `useGatewaySessions` hook — Gateway WS request pattern via react-query
- `SessionOutputPanel` — Right panel structure with header, status dot, content area
- `cleanText()` — Message text sanitization

### Established Patterns
- Split-pane layout with resizable divider (SessionsPage)
- react-query for data fetching with `queryKeys` registry
- Gateway WS proxying via `gateway_forward()` in Rust backend
- CSS vars for theming (no hardcoded colors)
- `isDemoMode()` guard for demo/dev fallback

### Integration Points
- SessionsPage right panel — add tab toggle to switch between Output and History
- `src-tauri/src/routes/gateway.rs` — May need new `gateway/sessions/:id/history` route
- `frontend/src/lib/query-keys.ts` — New query key for session history
- Session types in `frontend/src/pages/sessions/types.ts` — Add history message type

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 29-session-history-view*
*Context gathered: 2026-03-24*
