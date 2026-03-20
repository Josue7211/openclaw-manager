---
created: 2026-03-20T03:28:49.938Z
title: Wallbash dark/light mode switching ignored
area: ui
files:
  - src-tauri/src/commands.rs:242-308
  - frontend/src/lib/theme-engine.ts:62-120
  - frontend/src/main.tsx:137-156
---

## Problem

Wallbash has 3 modes: **theme**, **dark**, **light** (plus auto). When wallbash is in "theme" mode, system mode works correctly — the app picks up GTK wallbash colors and mirrors the desktop theme.

But switching wallbash to explicit "dark" or "light" mode doesn't change the app. It stays on the theme mode colors regardless.

**Root cause hypothesis:** When wallbash switches between dark/light mode, it likely only writes `theme.conf` (changing `$COLOR_SCHEME` from `prefer-dark` to `prefer-light`) without rewriting `colors.conf`. The Rust file watcher's coalesced event currently requires `colors.conf` OR `theme.conf` to change, but the 150ms sleep + drain may swallow the theme.conf-only event. Additionally, `buildWallbashTheme()` may not be re-invoked because the wallbash colors haven't changed — only the scheme has.

**What works:** Theme mode + system mode correctly detects GTK theme and applies wallbash colors. The pry1↔pry4 swap based on COLOR_SCHEME is correct. The coalesced event prevents flash on theme switches.

**What's broken:** Switching wallbash dark↔light doesn't propagate to the app.

## Solution

1. Verify hypothesis: check if wallbash dark/light only writes `theme.conf` (add temp logging or `inotifywait`)
2. If confirmed: ensure the watcher fires on theme.conf-only changes and that the frontend re-runs `buildWallbashTheme()` with the updated `_wallbashColorScheme` even when colors haven't changed
3. May need to separate the "colors changed" and "scheme changed" paths — scheme change should trigger a re-apply even with same colors
