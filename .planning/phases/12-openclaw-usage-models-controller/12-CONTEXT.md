# Phase 12: OpenClaw Usage + Models + Controller Page - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a unified OpenClawPage.tsx with 5 tabs (Agents, Crons, Usage, Models, Tools). Agents and Crons tabs embed existing pages from Phases 10-11. Usage/Models/Tools tabs are new read-only dashboards with 30s polling. Backend adds 3 proxy routes via gateway_forward().

</domain>

<decisions>
## Implementation Decisions

### Tab Architecture
- Follow Pipeline.tsx pattern: useState<TabKey> + conditional rendering
- 5 tabs: Agents, Crons, Usage, Models, Tools
- Agents tab embeds the existing Agents page components (adapt from full-bleed to flex container)
- Crons tab embeds the existing CronJobs page components
- Usage/Models/Tools are new components

### Backend
- 3 new proxy routes: GET /api/openclaw/usage, /api/openclaw/models, /api/openclaw/tools
- All via gateway_forward() from gateway.rs
- Response types use optional fields (OpenClaw API shapes aren't fully known)

### Frontend
- No chart library — use existing SVG primitives (StatCard, custom charts)
- React Query polling at 30s with refetchOnWindowFocus: true
- Lazy rendering: only the active tab's component mounts (prevents polling waste)
- Usage: token counts, cost breakdown, model usage stats
- Models: list of available models with provider, capabilities
- Tools: tool registry with name, description, enabled status

### Claude's Discretion
- Exact chart layouts for usage tab
- How to adapt full-bleed Agents layout to tab container
- Data display format for models and tools tabs
- Whether to consolidate module IDs or keep separate agents/crons

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Pipeline.tsx tab pattern (useState<TabKey> + conditional rendering)
- Agents page components from Phase 10
- CronJobs page components from Phase 11
- useAgents, useCrons hooks for data
- gateway_forward() for proxy routes
- StatCard, existing dashboard chart primitives

### Integration Points
- New: pages/OpenClawPage.tsx (or pages/openclaw/)
- Backend: routes/openclaw_cli.rs (extend or new routes)
- Sidebar: openclaw module registration
- Widget picker: potential OpenClaw widgets

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard dashboard composition

</specifics>

<deferred>
## Deferred Ideas

- SH-01 Agent Memory Browser — deferred, unclear if OpenClaw RAG memory or local workspace

</deferred>
