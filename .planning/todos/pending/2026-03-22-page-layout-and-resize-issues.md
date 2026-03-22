---
created: 2026-03-22T17:30:00.000Z
title: Pages don't fill screen and app handles resizing poorly
area: ui
files:
  - frontend/src/pages/Todos.tsx
  - frontend/src/pages/Dashboard.tsx
  - frontend/src/components/LayoutShell.tsx
  - frontend/src/globals.css
---

## Problem

Two related layout issues visible in screenshots:

### 1. Pages don't take up the full screen width
- Todos page: content is left-aligned in a narrow column, massive empty space on the right
- Dashboard page: widgets only fill ~60% of available width, right side is empty
- The main content area should expand to fill all available horizontal space
- Likely the content wrapper has a `max-width` or the grid isn't using the full container width

### 2. App handles window resizing poorly
- When resizing the window, content doesn't reflow responsively
- Dashboard grid should respond to container width changes via react-grid-layout breakpoints
- Full-page routes (Todos, Calendar, etc.) should stretch to fill available width
- The sidebar collapse/expand should also trigger content reflow

### Screenshots show:
- Dashboard: widgets clustered on left ~60% of screen, right 40% empty
- Todos: todo items in a narrow ~50% width column, right half completely empty
- Both pages have wasted horizontal space on wide screens

## Solution

1. Check LayoutShell.tsx `<main>` element — ensure it has `flex: 1` and no constraining `max-width`
2. Check page-level containers for hardcoded `max-width` or narrow `width` values
3. Dashboard: ensure `useContainerWidth` is measuring the actual container, not a stale/narrow value
4. Todos page: the content container likely has `max-width: 640px` or similar — should be wider or full-width with a sensible max
5. Test at multiple window sizes to ensure responsive behavior
