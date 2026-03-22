# Phase 10: OpenClaw Agent Management - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a polished Agent Management tab with a card grid on the left and a right-side settings panel (note-editor style). Backend: add POST/DELETE agent endpoints following existing patterns. Frontend: split-pane layout, optimistic mutations, confirmation dialogs. Lifecycle controls (start/stop/restart) proxy through gateway_forward() — even if OpenClaw API isn't fully wired yet, the UI is ready.

</domain>

<decisions>
## Implementation Decisions

### Layout & UX
- Split-pane layout modeled after Notes.tsx: agent list on left, detail/settings panel on right
- Agent cards in a vertical list (not grid) — simpler, matches the agents page purpose
- Clicking an agent card selects it and opens the right panel with all settings
- Settings panel shows: name, display_name, emoji, role, model, status, color, current_task
- Lifecycle controls (start/stop/restart) as action buttons at the top of the settings panel
- Create agent: button at top of list, opens the right panel in "create" mode
- Delete agent: button in settings panel, shows confirmation dialog (portal to document.body)

### Backend
- Add POST /agents (create) and DELETE /agents/:id (soft delete via deleted_at) endpoints
- Follow identical sqlx patterns as existing GET/PATCH in agents.rs
- Soft delete + log_mutation() for Supabase sync
- Agent lifecycle (start/stop/restart) proxied via gateway_forward() to OpenClaw VM
- No UUID validation on agent IDs — seed agents use short string IDs like 'koda', 'fast'

### Data & State
- Optimistic updates via React Query useMutation pattern (from useTodos.ts)
- Invalidate agent queries on mutation success
- Agent type expanded with missing fields: name, sort_order, created_at, updated_at
- React Query key: ['agents'] (centralized in query-keys.ts)

### Claude's Discretion
- Internal component decomposition and naming
- Exact card styling (follow existing AgentCard patterns)
- Animation/transition details for panel open/close
- How to handle agents without a model or role set

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Notes.tsx` split-pane layout (left list + right editor)
- `AgentCard.tsx` in dashboard — existing card styling
- `useTodos.ts` — optimistic mutation pattern with queryClient
- `DashboardTabs.tsx` — confirmation dialog via portal
- `gateway_forward()` from Phase 9 — lifecycle proxy
- `agents.rs` — GET/PATCH endpoints already working

### Established Patterns
- React Query for all data fetching, query keys in query-keys.ts
- api.get/post/put/patch/del wrapper from lib/api.ts
- CSS variables from globals.css for all styling
- RequireAuth + validate_uuid for backend security
- Soft delete pattern (deleted_at column)
- log_mutation() for Supabase sync

### Integration Points
- New page: pages/agents/AgentsPage.tsx (or expand existing)
- Backend: agents.rs (add POST/DELETE routes)
- Sidebar: already has agents module registered
- Widget picker: AgentsCard already exists

</code_context>

<specifics>
## Specific Ideas

User wants: "pretty" agent cards, click settings to open right-side panel "note style", all agent settings visible.

</specifics>

<deferred>
## Deferred Ideas

- Agent memory browser (SH-01) — deferred to Phase 12
- Migration for memory TEXT column — deferred until memory browser phase

</deferred>
