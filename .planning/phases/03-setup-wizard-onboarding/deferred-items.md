# Deferred Items — Phase 03

## Pre-existing Test Failures

- `frontend/src/lib/__tests__/theme-definitions.test.ts`: Expects 24 themes but 37 exist (Phase 02 added themes without updating test counts). Tests: BUILT_IN_THEMES count, dark preset count, light preset count.
- `frontend/src/lib/__tests__/theme-contrast.test.ts`: edge-runner-light accent contrast (2.94 < 3.0), nord-light composited text-muted contrast (2.96 < 3.0). Pre-existing contrast issues from Phase 02.

## Wallbash/GTK System Mode Integration (Needs Dedicated Phase)

Inline fixes during phase 03 verification introduced too many incremental patches that don't work reliably. The full wallbash↔app theme integration needs a proper planned phase covering:

- **gsettings monitor** — Rust subprocess spawns `gsettings monitor` for instant color-scheme detection. Added but may cause crashes or race conditions during rapid switching.
- **Use GTK Theme toggle** — Added to Settings → Personalization, auto-enables on wallbash detection. May have localStorage state issues (undefined vs false).
- **Debounced apply** — 100ms debounce coalesces file watcher + gsettings + OS theme events. May be swallowing events or not firing.
- **Crossfade transition** — View Transitions API crashes WebKitGTK, guard added but crossfade is effectively disabled on Linux.
- **Counterpart resolution** — COUNTERPART_MAP works in tests but runtime behavior inconsistent when wallbash switches dark↔light.

### Commits to audit/potentially revert:
- `691a69b` fix(03-07): sync osDarkPreference on wallbash startup initialization
- `c638c1e` fix(03-07): poll gsettings color-scheme even when wallbash is active
- `9c6b4c6` fix(03-07): reduce gsettings poll interval to 1s
- `3b7eff0` feat(03-07): add Use GTK Theme toggle, gsettings monitor, crossfade transitions
- `aa4d178` fix(03-07): add isWebKitGTK guard to crossfade transition
- `5251515` fix(03-07): debounce wallbash/gsettings theme applies
- `239f48e` fix(03-07): auto-enable useGtkTheme on first wallbash/GTK detection
