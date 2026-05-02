---
created: 2026-03-22T17:25:00.000Z
title: Remove "No Agent modules" empty state from sidebar settings
area: ui
files:
  - frontend/src/pages/settings/SettingsModules.tsx
---

## Problem

Settings → Sidebar page shows a large "BJORN MODULES" section at the bottom with "No Agent modules yet — Use the Agent tab in Chat to create one." This is confusing because there ARE modules (the user sees 11 modules listed above). The Agent section should either be hidden when empty or removed entirely until Agent module creation is actually functional.

## Solution

Hide the Agent modules section when there are no AI-generated modules. Only show it when `bjornModules.length > 0`. This keeps the page clean and avoids confusion.
