# Phase 97: Chat Abort & Stream Resilience - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous mode)

<domain>
## Phase Boundary

Users can cancel in-progress responses via a Stop button that sends chat.abort. Partial responses received before abort are preserved in the thread. Connection drops mid-stream preserve tokens received so far. After disconnect, the app reconnects and the user can continue the conversation.

</domain>

<decisions>
## Implementation Decisions

### Stop Button
- Visible only during active streaming (replaces send button position)
- Sends `chat.abort` via Axum proxy to gateway
- After abort, partial response is preserved as a complete message (not deleted)

### Backend Route
- `POST /api/gateway/chat/abort` — calls `gateway_forward(POST, /chat/abort)` with `{ sessionKey }`

### Partial Response Preservation
- Streaming tokens accumulated so far are kept in state
- On abort or disconnect, the accumulated content becomes a final message
- No "incomplete" marker needed — the content stands as-is

### Reconnection
- The existing SSE `useGatewaySSE` hook auto-reconnects via EventSource default behavior
- After reconnection, the user can send new messages normally
- No automatic retry of the aborted response

### Claude's Discretion
- Stop button icon (square stop icon is standard)
- Whether to show a "Response was stopped" indicator on aborted messages
- Exact reconnection delay behavior

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useChatSend` hook (Phase 93) — streaming state management
- `useGatewaySSE` — auto-reconnecting EventSource
- `gateway_forward()` — POST proxy pattern

### Integration Points
- Backend: Add `POST /api/gateway/chat/abort` route
- Frontend: Add stop button to compose area, wire to abort mutation
- Hook: Add abort method to `useChatSend` hook

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard abort/resilience patterns.

</specifics>

<deferred>
## Deferred Ideas

- Automatic retry of aborted responses
- Resume streaming from where it left off

</deferred>
