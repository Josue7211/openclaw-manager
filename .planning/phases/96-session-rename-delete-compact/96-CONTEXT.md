# Phase 96: Session Rename, Delete, Compact - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous mode)

<domain>
## Phase Boundary

Users can manage existing sessions — rename labels for organization, delete unwanted sessions with confirmation, and compact sessions to reduce token usage. All operations use the OpenClaw gateway RPC methods (sessions.patch, sessions.delete, sessions.compact) and update the session list immediately without full refetch.

</domain>

<decisions>
## Implementation Decisions

### Interaction Pattern
- Right-click context menu on SessionCard (or three-dot menu button) with options: Rename, Compact, Delete
- Double-click on session label triggers inline rename (editable text field replaces label)
- Delete shows a confirmation dialog before proceeding (prevents accidental deletion)
- Compact shows a brief confirmation + visual feedback (token count before/after if available)

### Backend Routes
- `PATCH /api/gateway/sessions/:key` — calls `gateway_forward(PATCH, /sessions/{key})` with `{ label }` body → maps to `sessions.patch`
- `DELETE /api/gateway/sessions/:key` — calls `gateway_forward(DELETE, /sessions/{key})` → maps to `sessions.delete`
- `POST /api/gateway/sessions/:key/compact` — calls `gateway_forward(POST, /sessions/{key}/compact)` → maps to `sessions.compact`

### Optimistic Updates
- Rename: update SessionCard label immediately via React Query cache, rollback on error
- Delete: remove from list immediately, rollback on error
- Compact: show "compacting..." state, update messageCount/token info on success
- All mutations invalidate `queryKeys.gatewaySessions` on settlement

### UI Feedback
- Rename: inline text input with Enter to confirm, Escape to cancel
- Delete: modal confirmation dialog with session label displayed, styled like existing delete dialogs
- Compact: button with loading spinner/state, success toast or inline feedback
- Error states: toast or inline error message on failure

### Claude's Discretion
- Exact context menu positioning and styling
- Animation for session removal from list (slide out or fade)
- Whether to show token savings after compact
- Keyboard shortcuts for rename (F2) and delete (Backspace/Delete with focus)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SessionCard.tsx` — React.memo'd card component with button element and aria-pressed
- `SessionList.tsx` — scrollable list rendering SessionCards
- `useGatewaySessions.ts` — React Query hook for session list
- `gateway_forward()` — single chokepoint for all gateway API calls
- `queryKeys.gatewaySessions` — cache key for invalidation
- Existing delete confirmation dialog pattern (check Messages or other pages for example)

### Established Patterns
- Optimistic updates: `useMutation` with `onMutate` (cancel queries, set optimistic data, return rollback), `onError` (rollback), `onSettled` (invalidate)
- Context menu: check if any existing context menus in the app (Messages page has MessageMenu)
- Inline editing: check for existing inline edit patterns
- Gateway mutations: `gateway_forward(state, Method::PATCH/DELETE/POST, path, body)`

### Integration Points
- Backend: Add 3 routes to `gateway.rs` router
- Frontend: Add context menu to `SessionCard`, mutation hooks to a new `useSessionMutations.ts` hook
- SessionList needs to handle the selected session being deleted (clear selection)

</code_context>

<specifics>
## Specific Ideas

- Context menu should follow the app's existing menu pattern (if one exists in Messages)
- Delete confirmation should be styled consistently with other confirmations in the app
- The "compact" concept should be explained briefly in the UI since users may not understand token compaction

</specifics>

<deferred>
## Deferred Ideas

- Bulk operations (select multiple sessions to delete)
- Session archival (hide without deleting)
- Undo for delete (soft delete with timer)

</deferred>
