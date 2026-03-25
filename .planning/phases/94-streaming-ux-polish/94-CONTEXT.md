# Phase 94: Streaming UX Polish - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous mode)

<domain>
## Phase Boundary

Polish the chat streaming experience with low-latency token rendering, a visible thinking/typing indicator while waiting for the first token, multiline input support (Shift+Enter for newline, Enter to send), and disabled send button during active streaming.

</domain>

<decisions>
## Implementation Decisions

### Thinking Indicator
- Show a pulsing dot animation or "thinking..." text below the user's message while waiting for the first token
- Indicator appears immediately after send, disappears when first token arrives
- Uses CSS animation (var(--ease-spring)) — no external library

### Multiline Input
- Shift+Enter inserts a newline in the compose input
- Enter alone sends the message
- Input auto-grows as content increases (textarea with dynamic height)
- Max height before scrolling: ~120px (roughly 5 lines)

### Send Button State
- Disabled and visually dimmed while an agent response is streaming
- Re-enabled when streaming completes or is aborted
- Empty input also disables send button

### Token Latency
- Target: <200ms from SSE event to UI render
- Use requestAnimationFrame or direct state updates (no debounce/throttle on tokens)
- Batch DOM updates naturally via React's concurrent rendering

### Claude's Discretion
- Exact thinking indicator animation style
- Whether to show character count or token estimate
- Exact textarea growth behavior

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useChatSend` hook (from Phase 93) — manages streaming state and message sending
- `SessionHistoryPanel.tsx` — message thread rendering
- CSS variables: `--ease-spring`, `--accent`, `--text-muted`
- Shimmer animation in `globals.css`

### Integration Points
- Modify the compose input component (added in Phase 93) to support multiline
- Add thinking indicator to the streaming state in the chat hook
- Wire send button disabled state to streaming status

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard UX polish patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
