---
phase: 02-theming-system
plan: 04
subsystem: ui
tags: [react, theming, accessibility, keybindings, color-picker, react-colorful, modal]

# Dependency graph
requires:
  - phase: 02-01
    provides: theme-definitions with 17 built-in presets and ThemeDefinition type
  - phase: 02-02
    provides: theme-store with useSyncExternalStore pattern, setActiveTheme, setMode, setAccentOverride
  - phase: 02-03
    provides: theme-engine with applyTheme and ripple animation support
provides:
  - ThemePicker modal with categorized theme grid, mode selector, search, and accent picker
  - ThemeCard component with gradient artwork, swatches, and radio accessibility
  - AccentPicker component with 7 presets + react-colorful custom hex picker
  - Super+Shift+T keybinding registration and matchesExtraModifier utility
  - LayoutShell integration with lazy-loaded ThemePicker and chord keybinding handler
affects: [02-05, 02-06, 02-07]

# Tech tracking
tech-stack:
  added: [react-colorful (HexColorPicker, HexColorInput)]
  patterns: [chord keybindings via matchesExtraModifier, categorized theme grid, portal modal with focus trap]

key-files:
  created:
    - frontend/src/components/ThemePicker.tsx
    - frontend/src/components/ThemeCard.tsx
    - frontend/src/components/AccentPicker.tsx
    - frontend/src/components/ui/__tests__/ThemePicker.test.tsx
  modified:
    - frontend/src/lib/keybindings.ts
    - frontend/src/components/LayoutShell.tsx

key-decisions:
  - "matchesExtraModifier() enables chord keybindings (Ctrl+Shift+T) without conflicting with single-mod bindings (Ctrl+T)"
  - "ThemeCard uses role=radio with aria-checked for accessible theme selection within radiogroup"
  - "AccentPicker popover positioned below-right to avoid clipping in the modal scroll container"
  - "Mode selector uses segmented control pattern with role=radiogroup matching existing app patterns"

patterns-established:
  - "Chord keybinding pattern: modifier + extra modifier via matchesExtraModifier utility"
  - "Theme card gradient artwork: auto-generated from bg-base and accent when no artwork image"
  - "Portal modal with entrance/exit animations: scale 0.95-1.0 for open, scale 1.0-0.95 for close"

requirements-completed: [THEME-01, THEME-02, THEME-04, THEME-08]

# Metrics
duration: 7min
completed: 2026-03-19
---

# Phase 02 Plan 04: Theme Picker UI Summary

**Theme picker modal with categorized grid of 17 presets, mode selector, search, accent picker via react-colorful, and Super+Shift+T keybinding**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-19T18:32:37Z
- **Completed:** 2026-03-19T18:39:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- ThemePicker modal opens via Super+Shift+T with lazy loading, portal rendering, and focus trap
- All 17 built-in themes displayed as accessible cards with gradient artwork and color swatches
- Mode selector (Dark/Light/System) as segmented control at top of picker
- AccentPicker with 7 preset swatches plus custom hex color picker via react-colorful
- 7 tests covering dialog rendering, accessibility attributes, mode selector, search filtering, and category headings

## Task Commits

Each task was committed atomically:

1. **Task 1: Register Super+Shift+T keybinding + create ThemeCard and AccentPicker** - `87333a7` (feat)
2. **Task 2: Create ThemePicker modal and wire into LayoutShell** - `925e9e1` (feat)

## Files Created/Modified
- `frontend/src/components/ThemePicker.tsx` - Modal with categorized theme grid, mode selector, search, accent picker
- `frontend/src/components/ThemeCard.tsx` - Individual theme card with gradient artwork, swatches, pin/delete UI
- `frontend/src/components/AccentPicker.tsx` - 7 preset swatch buttons + react-colorful custom hex picker popover
- `frontend/src/components/ui/__tests__/ThemePicker.test.tsx` - 7 tests for ThemePicker component
- `frontend/src/lib/keybindings.ts` - Added theme-picker binding (Shift modifier) + matchesExtraModifier utility
- `frontend/src/components/LayoutShell.tsx` - Lazy ThemePicker import, themePickerOpen state, chord handler

## Decisions Made
- Used matchesExtraModifier() to support chord keybindings (Ctrl+Shift+T) without breaking single-mod bindings (Ctrl+T for nav-todos). Simple bindings now check that Shift is NOT pressed to avoid ambiguity.
- ThemeCard renders as `<button role="radio">` with `aria-checked` for screen reader compatibility within a radiogroup
- AccentPicker popover opens below-right of the custom color trigger to stay within modal bounds
- Section headings use static category order (Pinned, Dark, Light, Colorful, High Contrast, Custom) per UI-SPEC

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added matchesExtraModifier to prevent chord/single-mod conflicts**
- **Found during:** Task 1 (Keybinding registration)
- **Issue:** Both nav-todos (Ctrl+T) and theme-picker (Ctrl+Shift+T) would match when Shift was held because isBindingModPressed only checks one modifier
- **Fix:** Added matchesExtraModifier() that verifies: (a) bindings with modifier override also require global mod, (b) simple bindings reject when Shift is pressed
- **Files modified:** frontend/src/lib/keybindings.ts, frontend/src/components/LayoutShell.tsx
- **Verification:** TypeScript compiles, all 1174 tests pass
- **Committed in:** 87333a7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for keybinding correctness. Without it, Ctrl+Shift+T would trigger both nav-todos and theme-picker.

## Issues Encountered
- LayoutShell.tsx had concurrent modifications from plan 02-06 running in parallel (added unused imports for theme-scheduling). Removed the unused imports to keep the file clean. No functional impact.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Theme picker modal fully functional with all 17 presets, mode switching, and accent customization
- Ready for plan 02-05 (Settings Display panel expansion) to embed theme controls in Settings
- Ready for plan 02-06 (import/export, scheduling) to extend the Custom section

## Self-Check: PASSED

All 6 files verified present. Both task commits (87333a7, 925e9e1) verified in git log.

---
*Phase: 02-theming-system*
*Completed: 2026-03-19*
