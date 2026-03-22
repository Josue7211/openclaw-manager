# Phase 7: Theme Blend -- Interpolation Engine - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the interpolation engine that blends all Tier 1 CSS variables between a dark and light theme. Tier 2 (accent, status) remains untouched. Text color auto-switches based on background lightness. WCAG AA enforced at every blend position.

</domain>

<decisions>
## Implementation Decisions

### Interpolation Architecture
- Parse rgba() values and interpolate each channel (r, g, b, a) independently — many Tier 1 vars use rgba
- Create new `theme-engine.ts` file — keeps themes.ts clean, engine is a separate concern
- Text color switching threshold: OKLCH lightness L > 0.6 → dark text, L ≤ 0.6 → light text (perceptual midpoint)
- Post-interpolation WCAG AA enforcement: after blending, check each text/bg pair for 4.5:1 contrast; nudge text toward black/white if failing

### Integration Pattern
- `blendPosition` stored as 0-1 number in ThemeState (0 = dark, 1 = light)
- Blend active theme with its category counterpart (e.g., dracula ↔ default-light, default-dark ↔ default-light)
- Apply via `el.style.setProperty()` on documentElement — same pattern as existing `applyAccentColor()`

### Claude's Discretion
- Internal function decomposition and naming
- How to find the "counterpart" light/dark theme (could use category matching or explicit mapping)
- Edge case handling for themes that don't have a natural counterpart

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/lib/color-utils.ts` — hexToOklch, oklchToHex, interpolateHexOklch (built in Phase 6)
- `frontend/src/lib/themes.ts` — applyAccentColor, darken, lighten, hexToRgb patterns
- `frontend/src/lib/theme-definitions.ts` — 24 built-in themes with Tier 1/Tier 2 color maps

### Established Patterns
- ThemeDefinition.colors is Record<string, string> — CSS prop name → value
- Tier 1 keys: bg-base, bg-panel, bg-card, bg-card-hover, bg-elevated, bg-card-solid, bg-popover, bg-modal, text-primary, text-secondary, text-muted, border, border-hover, border-strong, border-subtle, glass-bg, glass-border, hover-bg, hover-bg-bright, active-bg, overlay-light, overlay, overlay-heavy
- Tier 2 keys: accent, accent-dim, accent-bright, glow-top-rgb, green, red, red-500, warning
- Many Tier 1 values are rgba() strings, not hex — interpolation must handle both formats
- ThemeState in theme-definitions.ts has mode, activeThemeId, overrides, customThemes, schedule

### Integration Points
- `applyAccentColor()` in themes.ts sets CSS vars on documentElement — same pattern for interpolated vars
- ThemeState needs new `blendPosition?: number` field
- globals.css references these CSS variables throughout the app

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
