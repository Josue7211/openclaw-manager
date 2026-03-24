# Phase 75: Protocol v3 Handshake - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

App connects to the OpenClaw gateway using the real protocol v3 handshake with proper identity. Connect message must include minProtocol/maxProtocol 3, role "operator", scopes array, client metadata, and device identity.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion. The OpenClaw gateway protocol v3 reference is the source of truth — see memory/reference_openclaw_complete.md for handshake spec.

</decisions>

<code_context>
## Existing Code Insights

Existing gateway connection code is in src-tauri/src/routes/gateway.rs. The WebSocket connection currently sends a basic connect message without proper protocol v3 params.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond matching the protocol spec.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
