# Phase 66: Strip Unused npm Dependencies - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

package.json contains only packages that are actually imported somewhere in the source. Use knip to identify unused deps, remove them, verify build still works.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion.

</decisions>

<code_context>
## Existing Code Insights

knip is configured. Run `cd frontend && npx knip --include dependencies` to get unused deps.

</code_context>

<specifics>
## Specific Ideas

No specific requirements.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
