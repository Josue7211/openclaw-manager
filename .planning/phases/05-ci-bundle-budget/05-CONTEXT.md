# Phase 5: Set CI Bundle Budget - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a bundle size check script that fails if any JS chunk exceeds 400KB gzip or total bundle exceeds 5MB uncompressed. Must run before adding TipTap or xterm.js packages.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Add a check script to scripts/ and integrate with pre-commit or CI workflow.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/perf-research/measure.sh` — existing bundle measurement script
- `frontend/vite.config.ts` — manual chunks config
- `.github/workflows/ci.yml` — existing CI pipeline

### Established Patterns
- Pre-commit hook at `.git/hooks/pre-commit` runs TypeScript check + tests
- `scripts/pre-commit.sh` orchestrates checks

### Integration Points
- CI workflow (GitHub Actions)
- Pre-commit hook (optional local enforcement)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
