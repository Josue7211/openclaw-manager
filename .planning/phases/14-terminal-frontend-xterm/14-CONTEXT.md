# Phase 14: Terminal Frontend (xterm.js) - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a working xterm.js terminal widget integrated with the app's theme and widget system. The widget connects to the Phase 13 PTY backend via WebSocket and provides a fully interactive shell session inside the dashboard.

</domain>

<decisions>
## Implementation Decisions

### Terminal Visual Design
- Color theme derived from app CSS variables via `getComputedStyle` — auto-syncs with theme blend slider
- Bar cursor (blinking) — modern terminal feel, matches VS Code/iTerm2
- 4px padding all sides — tight, maximizes terminal real estate in widget grid
- Thin overlay scrollbar on hover — clean look, matches app's minimal aesthetic

### Widget Behavior
- Default widget size: 4w × 5h (roughly 80×24 chars at default font)
- Max terminals matches backend limit (3) — 4th shows "max reached" inline
- Session killed on unmount — terminal widgets live only while visible, no zombie sessions
- Inline connection banner at top — "Connecting..." / "Disconnected" with reconnect button, collapses when connected

### Interaction
- Copy/paste via Ctrl+Shift+C/V — standard terminal convention, avoids Ctrl+C (SIGINT) conflict
- No search addon — deferred to keep bundle small
- Font size configurable per-widget via configSchema slider (10-18px, default 13)
- Click-to-focus — consistent with IDE terminals, doesn't steal focus on mount

### Claude's Discretion
- xterm.js addon selection beyond fit addon
- Internal component structure and hook separation
- CSS class naming conventions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useChatSocket` hook (`lib/hooks/useChatSocket.ts`) — WebSocket pattern with exponential backoff reconnection
- Widget system (`lib/widget-registry.ts`) — BUILTIN_WIDGETS array with lazy-loaded components, configSchema
- `WidgetWrapper.tsx` — Suspense + error boundary wrapper with edit-mode chrome
- `DashboardGrid.tsx` — react-grid-layout with responsive breakpoints (xl:12, lg:12, md:8, sm:4 cols)
- Dashboard defaults (`lib/dashboard-defaults.ts`) — DEFAULT_ORDER and per-breakpoint layout generators
- CSS variables in `globals.css` — `--bg-base`, `--text-primary`, `--border`, `--accent`, all color vars

### Established Patterns
- Widget components receive `{ widgetId, config, isEditMode, size: { w, h } }` props (WidgetProps)
- Lazy-loaded via `() => import('@/components/widgets/...').then(m => ({ default: m.ComponentName }))`
- React.memo on widget components for performance
- Custom hooks for data fetching and WebSocket connections
- ResizeObserver for responsive layout adjustments

### Integration Points
- Widget registration: add entry to `BUILTIN_WIDGETS` in `lib/widget-registry.ts`
- WebSocket endpoint: `/api/terminal/ws` (Phase 13 backend)
- Terminal protocol: JSON `{ type: 'resize', cols, rows }` and `{ type: 'input', data }` or raw binary
- Theme system: `data-theme` attribute on `<html>`, CSS variables available via `getComputedStyle`
- NPM packages: `xterm` + `@xterm/addon-fit` need to be added to package.json

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard xterm.js integration following established widget patterns.

</specifics>

<deferred>
## Deferred Ideas

- xterm.js search addon (search within terminal output)
- Session persistence across tab changes (background terminals)
- Terminal tabs within a single widget (multi-session)
- Shell selection dropdown (bash, zsh, fish, etc.)

</deferred>
