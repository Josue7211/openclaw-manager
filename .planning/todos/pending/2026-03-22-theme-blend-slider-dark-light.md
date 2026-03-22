---
created: 2026-03-22T17:25:00.000Z
title: Theme blend slider — continuous dark↔light interpolation
area: ui
files:
  - frontend/src/pages/settings/SettingsDisplay.tsx
  - frontend/src/lib/theme-store.ts
  - frontend/src/lib/themes.ts
  - frontend/src/globals.css
---

## Problem

Currently theme mode is binary: Dark, Light, or System. If Light mode is too bright, there's no middle ground. User wants a continuous slider between dark and light that interpolates all CSS variable colors.

## Solution

Add a "Custom" mode alongside Dark/Light/System. When Custom is selected, show a slider (0 = full dark, 100 = full light). The slider interpolates between the dark and light CSS variable values for the current theme preset.

**Implementation approach:**
1. Each theme preset already has both dark and light color definitions
2. Parse both sets of CSS variables (dark values + light values) into RGB/HSL
3. The slider value (0-100) drives `color-mix()` or manual interpolation between the two
4. Store the blend value in theme-store alongside the mode
5. Apply interpolated values as inline CSS custom properties on `[data-theme]`

**CSS `color-mix()` approach (modern, clean):**
```css
--bg-base: color-mix(in oklch, var(--bg-base-dark) calc(100% - var(--blend)), var(--bg-base-light) var(--blend));
```

Or generate interpolated values in JS and apply as inline styles on the root element.

**UI:**
- In Settings → Appearance, add "Custom" as a 4th mode option
- When selected, show a slider with a dark moon icon on the left and a sun icon on the right
- Slider thumb position = blend percentage
- Live preview as the user drags
