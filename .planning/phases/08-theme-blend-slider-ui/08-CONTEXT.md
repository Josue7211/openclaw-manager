# Phase 8: Theme Blend -- Slider UI + Persistence - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a blend position slider to Settings > Display that controls the dark↔light theme interpolation in real-time. Persist the blend position in ThemeState (localStorage + Supabase sync). Handle System mode interaction.

</domain>

<decisions>
## Implementation Decisions

### Slider Placement
- Add a new SettingsCard "Theme Blend" in SettingsDisplay.tsx, placed between the mode selector and theme presets
- Reuse the existing `SliderRow` component (already in SettingsDisplay.tsx at line 261)
- Slider range: 0 (dark) to 1 (light), step 0.01, displayed as 0-100%

### Persistence Pattern
- Follow the `setGlowOpacity` pattern in theme-store.ts: `mutate()` + localStorage via useSyncExternalStore
- Add `setBlendPosition()` to theme-store.ts
- `blendPosition` already added to `ThemeState` interface in Phase 7
- Supabase sync happens automatically via existing preferences-sync.ts

### Real-time Update
- RAF-throttle the slider's onChange to avoid layout thrashing (requestAnimationFrame)
- `applyTheme()` in theme-engine.ts already reads `blendPosition` and calls `interpolateThemes()` — slider just needs to update the state

### System Mode Interaction
- When mode switches to "System", reset blendPosition to undefined (use OS dark/light preference)
- When blendPosition is set, override the mode's theme choice with the blended result

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SliderRow` component in SettingsDisplay.tsx (line 261)
- `setGlowOpacity()` pattern in theme-store.ts (line 166)
- `applyTheme()` in theme-engine.ts already handles blendPosition
- `ThemeState.blendPosition` already defined in theme-definitions.ts (added in Phase 7)

### Integration Points
- SettingsDisplay.tsx: add new card with SliderRow
- theme-store.ts: add setBlendPosition() export
- theme-engine.ts: applyTheme already wired (Phase 7)

</code_context>
