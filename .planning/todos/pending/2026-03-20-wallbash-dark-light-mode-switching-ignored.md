---
created: 2026-03-20T03:28:49.938Z
title: Wallbash dark/light/auto switcher ignored + every theme needs light variant
area: ui
files:
  - src-tauri/src/commands.rs:242-308
  - frontend/src/lib/theme-engine.ts:62-120
  - frontend/src/lib/theme-definitions.ts
  - frontend/src/main.tsx:137-156
---

## Problem

Two related issues:

### 1. Wallbash dark/light/auto switcher ignored

Wallbash has 4 modes: **theme**, **auto** (time-of-day dark/light switcher), **dark**, **light**. When wallbash is in "theme" mode, system mode works correctly — the app picks up GTK wallbash colors and mirrors the desktop theme.

But switching wallbash to dark, light, or auto mode doesn't change the app. It stays on the theme mode colors regardless. Auto mode is particularly important since it tracks time of day — the app should follow along as auto flips between dark and light.

**Root cause hypothesis:** When wallbash switches modes, it likely only writes `theme.conf` (changing `$COLOR_SCHEME`) without rewriting `colors.conf`. The file watcher's coalesced event + 150ms sleep + drain may swallow the theme.conf-only change. `buildWallbashTheme()` isn't re-invoked because wallbash colors haven't changed — only the scheme has.

### 2. Every built-in theme needs a light mode variant

Currently dark-only themes (Dracula, Nord, Tokyo Night, etc.) have no light counterpart. This means system mode can't do a clean dark↔light switch for every theme — it has to fall back to `default-light`. Every theme should have both a dark and light variant so system mode just picks the right variant without needing smart fallback logic.

## Solution

### For wallbash switcher:
1. Verify: does wallbash dark/light only write `theme.conf`? (use `inotifywait` to check)
2. Ensure watcher fires on theme.conf-only changes and frontend re-runs `buildWallbashTheme()` with updated scheme even when colors are unchanged
3. May need to separate "colors changed" vs "scheme changed" paths

### For theme light variants:
1. Add light variants for all dark-only themes: Dracula Light, Nord Light, Tokyo Night Light, etc.
2. Extend COUNTERPART_MAP with all new pairs
3. System mode then always has a correct counterpart — no fallback needed
