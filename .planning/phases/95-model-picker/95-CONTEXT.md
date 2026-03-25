# Phase 95: Model Picker for New Sessions - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous mode)

<domain>
## Phase Boundary

A model picker is visible when starting a new session (before the first message). Available models are fetched from the gateway via models.list. The selected model is included as a parameter when chat.send creates the session. The picker defaults to a sensible model.

</domain>

<decisions>
## Implementation Decisions

### Model Fetching
- Use existing `useOpenClawModels` hook or `queryKeys.openclawModels` if it already fetches from gateway
- If not, add `GET /api/gateway/models` route that calls `gateway_forward(GET, /models)`
- Models displayed with provider labels (e.g., "Claude 3.5 Sonnet • Anthropic")

### Picker UI
- Dropdown or select component shown in the compose area when no session is selected (new chat mode)
- Picker disappears after the first message is sent (session is created with that model)
- Default: most recent session's model, or first model in the list

### Integration with chat.send
- The selected model ID is passed as a parameter to `chat.send` when creating a new session
- For existing sessions, the model is fixed — no picker shown

### Claude's Discretion
- Exact picker component styling
- Whether to show model capabilities (context length, etc.)
- Grouping by provider

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `queryKeys.openclawModels` — already registered
- Existing models tab in OpenClaw section may have a models hook
- `gateway_forward(GET, /models)` — standard gateway proxy pattern

### Integration Points
- Backend: May need `GET /api/gateway/models` route if not already present
- Frontend: Add picker to compose area, wire to chat.send model param

</code_context>

<specifics>
## Specific Ideas

- Never hardcode model options — always fetch dynamically from gateway (per project rules)

</specifics>

<deferred>
## Deferred Ideas

- Model comparison view
- Per-session model switching mid-conversation

</deferred>
