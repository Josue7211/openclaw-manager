# Deferred Items -- Phase 02

## Pre-existing Test Failures

**theme-store.test.ts: 7 failures due to missing window.matchMedia mock**
- Discovered during: Plan 02-03 execution (pre-commit hook)
- Root cause: `theme-engine.ts` calls `window.matchMedia('(prefers-reduced-motion: reduce)')` which is not available in jsdom/happy-dom test environment
- Affected tests: setActiveTheme, subscribeTheme, lastModified -- all tests that trigger `applyThemeFromState` -> `applyTheme`
- Fix needed: Add `window.matchMedia` mock in test setup or in theme-store.test.ts beforeEach
- Not related to Plan 02-03 changes (theme-validation.ts)

**ThemePicker.test.tsx: 1 failure in "renders theme categories" test**
- Discovered during: Plan 02-06 execution (test suite verification)
- Root cause: `screen.getByText('Dark')` finds multiple elements -- the 'Dark' mode button label and the 'Dark' category heading both match
- Fix needed: Use `getAllByText` or a more specific query in ThemePicker.test.tsx line 106
- Not related to Plan 02-06 changes (CustomCssEditor, ThemeScheduler, LayoutShell)
