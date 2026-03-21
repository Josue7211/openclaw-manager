# User Feedback — Theme System (Post Phase 02.1)

**Collected:** 2026-03-20
**Source:** Live user testing session

## Open Issues (need GSD plans)

### ISSUE-01: System mode shows all presets — should show only active system theme
- **Current:** System mode displays all 24 preset cards, user can click them but they don't do anything meaningful
- **Expected:** Show ONLY the active system theme card (e.g., "Material Sakura" with its swatches). Other presets disappear. User knows system is in control. On Windows (no GTK), fall back to dark/light filtering.
- **Priority:** High

### ISSUE-02: Dark/Light mode auto-switch preset
- **Current:** Switching from Dark to Light keeps the dark theme selected (e.g., Dracula stays selected in Light mode)
- **Expected:** Auto-switch to counterpart theme (gruvbox-dark ↔ gruvbox-light, catppuccin-mocha ↔ catppuccin-latte). Fall back to default-dark/default-light if no counterpart.
- **Priority:** High

### ISSUE-03: GTK polling not fast enough for desktop sync
- **Current:** 1-second polling detects changes but doesn't feel instant with Hyprland's ripple transition
- **Expected:** Watch `~/.config/hypr/themes/colors.conf` via Tauri fs plugin for instant detection. App ripple should sync with desktop ripple timing.
- **Priority:** Medium

### ISSUE-04: Wallbash dark/light mode changes not reflected in app
- **Current:** When Wallbash switches between dark/light/auto within the same theme, the GTK color-scheme changes but the app doesn't re-read the actual GTK colors
- **Expected:** In System mode, the app should re-read GTK colors on color-scheme change and update CSS variables accordingly — NOT switch the app's Dark/Light mode toggle, just update the visual colors
- **Priority:** High

### ISSUE-05: System mode should read live Wallbash colors
- **Current:** System mode maps GTK theme name to a built-in preset (static colors)
- **Expected:** When GTK theme is "Wallbash-Gtk", read live colors from `~/.config/hypr/themes/colors.conf` and apply them dynamically instead of using a static preset. This makes the app truly mirror the desktop.
- **Priority:** High

### ISSUE-06: Live preview pane for Settings
- **Current:** No preview — user has to close Settings to see theme changes on real content
- **Expected:** Dockable resizable preview pane (right side default, movable to top/bottom), shows real app content, updates in real-time with every slider/color change. On-demand — only appears when actively editing visual settings.
- **Priority:** Medium (future phase)

### ISSUE-07: Light mode text still hard to read
- **Current:** Even after WCAG audit fix, light mode themes (High Contrast Light, Default Light, etc.) have text that's difficult to read — likely sidebar text, card text, or secondary text colors are too faint against light backgrounds
- **Expected:** All light theme text-primary should be ≤ #333333, text-secondary ≤ #555555, text-muted ≤ #777777. Runtime contrast checker for Wallbash dynamic themes.
- **Priority:** High
- **Screenshot:** High Contrast Light selected — sidebar text and card text appear low contrast

## GTK Parity Features (from brainstorm — add to future phase)
- Border colors (active/inactive, gradient support)
- Gap sizes (inner/outer spacing)
- Blur settings (size, passes, opacity)
- Border width control
- Shadow toggle

## Brainstormed Settings Features (all approved — add to roadmap)
See: memory/project_customization_ideas.md for full list
