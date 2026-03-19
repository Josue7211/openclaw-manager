# User Feedback for Phase 02.1

## From testing session 2026-03-19

### System Mode
- System mode doesn't work on Hyprland — always detects "light" even with dark GTK theme
- Tauri's getCurrentWindow().theme() reads gtk-application-prefer-dark-theme flag, not actual GTK theme name
- Need Rust command to check gsettings gtk-theme name for "dark" substring as fallback

### Settings Display Page
- Page layout is flat and unorganized — everything in one long scroll
- Color picker rows (accent, secondary, glow, logo) are repetitive
- **Secondary color has no visible effect** — user can't notice any change when modifying it
  - Currently maps to --accent-blue, --accent-secondary, --blue-bright
  - Used in Chat bubbles, Dashboard, Personal, HomeLab, MediaRadar
  - Needs to be MORE impactful or get more usage across the app
- **User's color hierarchy vision:**
  - **Primary/Accent** = main accent color (purple, theme-dependent) — already works
  - **Secondary** = functional/status color currently hardcoded as green (--green). Used EVERYWHERE:
    - "Add" buttons, "RUNNING" badges, todo checkboxes, progress bars (CPU/RAM),
    - success states, active indicators, Proxmox status, OPNsense status
    - This is the most visible functional color in the app and should be customizable
  - **Tertiary** = what's currently called secondary (--accent-blue). Used in chat bubbles,
    dashboard cards, less prominent accents. Can remain customizable but is lower priority.
- **Goal: make the app AS customizable as possible** — every visible color the user sees
  should be controllable. Think Discord/Obsidian level customization.
- User wants MORE customizability overall — spacing, border radius, opacity, etc.
- Font section needs better preview
- Need card-based sections with headers for visual hierarchy

### Checkbox Styling
- Native WebKitGTK checkboxes rendered as black squares on dark themes
- Fixed with appearance:none custom CSS checkboxes using theme variables

### Card Backgrounds
- var(--bg-card) was transparent rgba with backdrop-filter — looked dark/black on many themes
- Fixed by overriding --bg-card with --bg-card-solid in theme engine
