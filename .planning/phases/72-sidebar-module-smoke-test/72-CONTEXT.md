# Phase 72: Sidebar Module Smoke Test - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

Every module registered in the sidebar loads its page component without crashing after all dead code removal. Write a vitest that imports every lazy-loaded page and verifies it renders.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — test/verification phase.

</decisions>

<code_context>
## Existing Code Insights

modules.ts defines all 20 modules. Each has a lazy-loaded page component.

</code_context>

<specifics>
## Specific Ideas

No specific requirements.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
