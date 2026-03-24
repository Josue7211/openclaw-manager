# Phase 65: Strip Unused File Exports - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

Every exported function, type, constant, and component in the frontend is imported by at least one consumer. Use knip to identify and remove unused exports.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure cleanup phase.

</decisions>

<code_context>
## Existing Code Insights

knip is configured (Phase 62). Run `npx knip` from frontend/ to get the list of unused exports.

</code_context>

<specifics>
## Specific Ideas

No specific requirements.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
