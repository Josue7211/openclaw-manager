# Phase 76: Reconnect with Backoff - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

Gateway connection recovers automatically after network disruptions without user intervention. Exponential backoff (1s, 2s, 4s, 8s, max 30s). No duplicate connections.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion.

</decisions>

<code_context>
## Existing Code Insights

Phase 75 rewrote gateway_ws.rs with protocol v3 handshake. The reconnect logic needs to build on that.

</code_context>

<specifics>
## Specific Ideas

No specific requirements.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
