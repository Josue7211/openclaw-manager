# Phase 16: Session Monitor Frontend - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a live dashboard page for monitoring and controlling Claude Code sessions. Session list with cards, live output viewer using xterm.js (reused from Phase 14), session creation/control actions, and real-time updates via WebSocket.

</domain>

<decisions>
## Implementation Decisions

### Visual Layout
- Session list in a card grid layout — each card shows task, status badge, duration, model
- Status badges use existing CSS color vars: running=green, paused=amber, completed=blue, failed=red
- Clicking a card opens a split-pane output viewer (Notes.tsx pattern from Phase 10)
- Output viewer reuses xterm.js Terminal from Phase 14 — connects to `/api/claude-sessions/:id/ws`
- Responsive: cards stack on small viewports, split-pane collapses to full-width

### Session Controls
- "New Session" button opens inline form: task textarea + optional working dir + model select
- Pause/Resume/Kill buttons on each session card (disabled when inapplicable)
- Kill shows confirmation inline (not modal) — matches Phase 10 agent lifecycle pattern
- Controls disabled (not hidden) when OpenClaw is unreachable

### Real-time Updates
- WebSocket connection to session output stream (reuses `useTerminal` hook pattern from Phase 14)
- Session list polls `/api/claude-sessions` every 5 seconds via React Query (consistent with dashboard polling)
- Status transitions trigger React Query invalidation for immediate UI update
- No SSE — REST polling + WebSocket output is simpler and proven

### Claude's Discretion
- Component file organization and hook structure
- Animation and transition details
- Empty state design
- Error message wording

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useTerminal` hook from Phase 14 — xterm.js lifecycle, can be adapted for read-only output viewing
- `TerminalWidget.tsx` pattern — xterm container with connection banner
- Split-pane layout from Notes.tsx / Agents page (Phase 10) — list + detail panel
- `api.get/post` from `lib/api.ts` — fetch wrapper with auth
- React Query patterns from `lib/query-keys.ts`
- Status badge styles from existing components (agents page uses similar patterns)

### Established Patterns
- Lazy-loaded pages via React Router
- React Query for server state with centralized query keys
- Split-pane with `ResizablePanel` for entity management pages
- `React.memo` on list items for performance
- CSS variables for all colors, never hardcoded

### Integration Points
- Backend: `/api/claude-sessions` REST endpoints (Phase 15)
- Backend: `/api/claude-sessions/:id/ws` WebSocket for output streaming
- Module registration: add to `lib/modules.ts` enabled modules
- Sidebar: add navigation entry
- Widget: optionally register a dashboard widget for quick session overview

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow established page patterns (Notes, Agents, OpenClaw).

</specifics>

<deferred>
## Deferred Ideas

- Session history/replay for completed sessions
- Token usage and cost display per session
- Structured output parsing (tool calls, code blocks highlighted)
- Multi-select session operations (bulk kill)
- Session search/filter

</deferred>
