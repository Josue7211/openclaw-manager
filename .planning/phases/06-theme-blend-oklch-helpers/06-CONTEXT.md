# Phase 8: Theme Blend OKLCH Helpers - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add pure utility functions for OKLCH color space conversion and interpolation to the theme system. hexToOklch, oklchToHex, interpolateHexOklch — pure functions with unit tests.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure utility phase. Functions go in a new file `frontend/src/lib/color-utils.ts`. Unit tests in `frontend/src/lib/__tests__/color-utils.test.ts`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/lib/themes.ts` — theme definitions with hex color values
- `frontend/src/lib/theme-store.ts` — useSyncExternalStore for theme state
- `frontend/src/globals.css` — CSS custom properties for all theme colors

### Integration Points
- Phase 9 will use these helpers in the interpolation engine
- Phase 10 will use the engine in the slider UI

</code_context>

<specifics>
## Specific Ideas

Use OKLCH (not sRGB) for perceptually uniform interpolation. The CSS `color-mix(in oklch)` approach is the modern standard.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
