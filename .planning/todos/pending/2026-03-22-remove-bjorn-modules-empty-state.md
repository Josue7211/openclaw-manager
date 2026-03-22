---
created: 2026-03-22T17:25:00.000Z
title: Remove "No Bjorn modules" empty state from sidebar settings
area: ui
files:
  - frontend/src/pages/settings/SettingsModules.tsx
---

## Problem

Settings → Sidebar page shows a large "BJORN MODULES" section at the bottom with "No Bjorn modules yet — Use the Bjorn tab in Chat to create one." This is confusing because there ARE modules (the user sees 11 modules listed above). The Bjorn section should either be hidden when empty or removed entirely until Bjorn module creation is actually functional.

## Solution

Hide the Bjorn modules section when there are no AI-generated modules. Only show it when `bjornModules.length > 0`. This keeps the page clean and avoids confusion.
