# Phase 14: Terminal Frontend (xterm.js) - Research

**Researched:** 2026-03-23
**Domain:** Terminal emulation (xterm.js), WebSocket integration, React widget system, theme mapping
**Confidence:** HIGH

## Summary

Phase 14 requires building a React terminal widget using xterm.js that connects to the Phase 13 PTY backend via WebSocket (`/api/terminal/ws`). The project already has a mature widget registration system (`widget-registry.ts`) with lazy-loaded components, a `configSchema` pattern for per-widget settings, and an established WebSocket hook (`useChatSocket.ts`) with exponential backoff reconnection. The xterm.js library is now at v6.0.0 under the `@xterm/xterm` scoped package (the old `xterm` package is deprecated).

The terminal widget must map the app's CSS variables to xterm.js's `ITheme` interface using `getComputedStyle()`, handle copy/paste via `attachCustomKeyEventHandler` intercepting Ctrl+Shift+C/V, and resize correctly using `@xterm/addon-fit` with a `ResizeObserver`. A critical CSS pitfall exists: the app's `globals.css` sets `user-select: none` on `*`, which will break xterm.js's text selection unless explicitly overridden on the terminal container.

**Primary recommendation:** Use `@xterm/xterm` 6.0.0 with `@xterm/addon-fit` 0.11.0 and `@xterm/addon-web-links` 0.12.0. Build a `useTerminal` custom hook that manages Terminal lifecycle (create in `useEffect`, dispose on cleanup), WebSocket connection with reconnection, and ResizeObserver-driven fitting. Register as a widget with `configSchema` for font size slider.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Color theme derived from app CSS variables via `getComputedStyle` -- auto-syncs with theme blend slider
- Bar cursor (blinking) -- modern terminal feel, matches VS Code/iTerm2
- 4px padding all sides -- tight, maximizes terminal real estate in widget grid
- Thin overlay scrollbar on hover -- clean look, matches app's minimal aesthetic
- Default widget size: 4w x 5h (roughly 80x24 chars at default font)
- Max terminals matches backend limit (3) -- 4th shows "max reached" inline
- Session killed on unmount -- terminal widgets live only while visible, no zombie sessions
- Inline connection banner at top -- "Connecting..." / "Disconnected" with reconnect button, collapses when connected
- Copy/paste via Ctrl+Shift+C/V -- standard terminal convention, avoids Ctrl+C (SIGINT) conflict
- No search addon -- deferred to keep bundle small
- Font size configurable per-widget via configSchema slider (10-18px, default 13)
- Click-to-focus -- consistent with IDE terminals, doesn't steal focus on mount

### Claude's Discretion
- xterm.js addon selection beyond fit addon
- Internal component structure and hook separation
- CSS class naming conventions

### Deferred Ideas (OUT OF SCOPE)
- xterm.js search addon (search within terminal output)
- Session persistence across tab changes (background terminals)
- Terminal tabs within a single widget (multi-session)
- Shell selection dropdown (bash, zsh, fish, etc.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-22 | Terminal Frontend (xterm.js) -- xterm.js component with WebSocket connection, fit addon for resize, theme integration, copy/paste, scrollback | xterm.js v6 API verified (Terminal, ITheme, ITerminalOptions), @xterm/addon-fit API confirmed, WebSocket protocol matched to Phase 13 backend (JSON `{type: "resize"}` + `{type: "input"}`), copy/paste via `attachCustomKeyEventHandler`, CSS `user-select` override identified |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xterm/xterm | 6.0.0 | Terminal emulator for the web | The canonical web terminal library, used by VS Code, Azure Cloud Shell, Hyper. v6 is the current major release with ESM support |
| @xterm/addon-fit | 0.11.0 | Fit terminal dimensions to container | Official addon, handles cols/rows calculation from pixel dimensions |
| @xterm/addon-web-links | 0.12.0 | Clickable URLs in terminal output | Official addon, auto-detects HTTP(S) URLs and makes them clickable. Tiny footprint, high utility for a terminal widget |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React (existing) | 19.x | Component framework | Already installed |
| Vite (existing) | 8.x | Bundler with code splitting | Already configured, lazy loading via `React.lazy()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @xterm/addon-web-links | No link addon | Users would see raw URLs they can't click; web-links is <5KB and very useful |
| @xterm/addon-webgl | DOM renderer (default) | WebGL is faster for high-throughput output but adds ~40KB and requires WebGL2 support; DOM renderer is sufficient for a widget-sized terminal |
| @xterm/addon-clipboard | Custom `attachCustomKeyEventHandler` | addon-clipboard adds OSC 52 support which is overkill; manual Ctrl+Shift+C/V is ~15 lines of code |

**Installation:**
```bash
cd frontend && npm install @xterm/xterm@^6.0.0 @xterm/addon-fit@^0.11.0 @xterm/addon-web-links@^0.12.0
```

**Vite chunk config (recommended):**
```typescript
// vite.config.ts manualChunks addition
if (id.includes('node_modules/@xterm')) return 'xterm'
```
This isolates xterm.js (~200-250KB minified) into its own chunk, lazy-loaded only when the terminal widget is rendered.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── components/widgets/
│   └── TerminalWidget.tsx      # Widget component (registered in widget-registry)
├── hooks/
│   └── useTerminal.ts          # Terminal lifecycle, WebSocket, resize, theme
└── lib/
    └── terminal-theme.ts       # CSS variable -> ITheme mapping utility
```

### Pattern 1: Terminal Lifecycle in useEffect
**What:** Create Terminal instance inside useEffect, dispose on cleanup
**When to use:** Always -- Terminal must only be created after DOM is ready
**Example:**
```typescript
// Source: xterm.js official docs + React best practices
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

function useTerminal(containerRef: React.RefObject<HTMLDivElement>, options: TerminalOptions) {
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    const term = new Terminal({
      cursorStyle: 'bar',
      cursorBlink: true,
      fontSize: options.fontSize ?? 13,
      fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      scrollback: 1000,
      theme: buildThemeFromCSS(),
      allowProposedApi: true,
    })

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(container)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    return () => {
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, []) // Empty deps -- create once

  return { termRef, fitAddonRef }
}
```

### Pattern 2: WebSocket Connection with Reconnection
**What:** Connect to `/api/terminal/ws`, relay data bidirectionally, handle reconnection
**When to use:** Inside the useTerminal hook after Terminal is created
**Example:**
```typescript
// Source: Adapted from useChatSocket.ts pattern + Phase 13 terminal protocol
const wsBase = API_BASE.replace(/^http/, 'ws')
const ws = new WebSocket(`${wsBase}/api/terminal/ws`)

// Terminal output from backend -> write to xterm
ws.onmessage = (event) => {
  if (event.data instanceof Blob) {
    event.data.arrayBuffer().then(buf => {
      term.write(new Uint8Array(buf))
    })
  } else if (typeof event.data === 'string') {
    term.write(event.data)
  }
}

// User input from xterm -> send to backend
term.onData((data) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }))
  }
})

// Binary data (mouse reports) -> send to backend
term.onBinary((data) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }))
  }
})
```

### Pattern 3: ResizeObserver + FitAddon
**What:** Watch container size changes, call fitAddon.fit(), send resize to backend
**When to use:** After Terminal is opened and WebSocket is connected
**Example:**
```typescript
// Source: xterm.js fit addon docs + React ResizeObserver pattern
const resizeObserver = new ResizeObserver(() => {
  // RAF to batch resize calculations
  requestAnimationFrame(() => {
    if (!fitAddonRef.current || !termRef.current) return
    fitAddonRef.current.fit()
  })
})

resizeObserver.observe(container)

// Listen for xterm resize events to notify backend
term.onResize(({ cols, rows }) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'resize', cols, rows }))
  }
})

// Cleanup
return () => resizeObserver.disconnect()
```

### Pattern 4: CSS Variable to ITheme Mapping
**What:** Read app CSS variables and map to xterm.js ITheme
**When to use:** On Terminal creation and when theme changes (data-theme attribute)
**Example:**
```typescript
// Source: xterm.js ITheme interface (xtermjs.org/docs/api/terminal/interfaces/itheme/)
function buildThemeFromCSS(): ITheme {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string) => style.getPropertyValue(name).trim()

  return {
    background: get('--bg-base') || '#0a0a0c',
    foreground: get('--text-primary') || '#e4e4ec',
    cursor: get('--accent') || '#a78bfa',
    cursorAccent: get('--bg-base') || '#0a0a0c',
    selectionBackground: 'rgba(167, 139, 250, 0.3)', // accent with alpha
    selectionForeground: undefined, // let xterm pick
    // ANSI color palette -- sensible defaults matching dark theme
    black: '#1a1a2e',
    red: get('--red') || '#f87171',
    green: get('--green') || '#34d399',
    yellow: get('--yellow') || '#eab308',
    blue: get('--blue') || '#60a5fa',
    magenta: get('--purple') || '#9b84ec',
    cyan: get('--cyan') || '#22d3ee',
    white: get('--text-primary') || '#e4e4ec',
    brightBlack: get('--text-muted') || '#8b8fa3',
    brightRed: get('--red-bright') || '#fca5a5',
    brightGreen: get('--green-bright') || '#6ee7b7',
    brightYellow: get('--yellow-bright') || '#facc15',
    brightBlue: get('--blue-bright') || '#a5b4fc',
    brightMagenta: get('--accent-bright') || '#c4b5fd',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
    // Scrollbar
    scrollbarSliderBackground: 'rgba(255, 255, 255, 0.1)',
    scrollbarSliderHoverBackground: 'rgba(255, 255, 255, 0.2)',
    scrollbarSliderActiveBackground: 'rgba(255, 255, 255, 0.3)',
  }
}
```

### Pattern 5: Copy/Paste via customKeyEventHandler
**What:** Intercept Ctrl+Shift+C/V for clipboard operations
**When to use:** After Terminal is created
**Example:**
```typescript
// Source: xterm.js issue #2478 + attachCustomKeyEventHandler docs
term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
  // Ctrl+Shift+C: Copy selection to clipboard
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyC' && event.type === 'keydown') {
    const selection = term.getSelection()
    if (selection) {
      navigator.clipboard.writeText(selection)
      return false // prevent terminal from processing
    }
  }

  // Ctrl+Shift+V: Paste from clipboard
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyV' && event.type === 'keydown') {
    navigator.clipboard.readText().then(text => {
      term.paste(text) // uses paste() for proper bracket handling
    })
    return false
  }

  return true // allow all other keys
})
```

### Pattern 6: Widget Registration
**What:** Register terminal in the widget system
**When to use:** In widget-registry.ts
**Example:**
```typescript
// Source: Existing widget-registry.ts pattern
{
  id: 'terminal',
  name: 'Terminal',
  description: 'Interactive terminal session',
  icon: 'Terminal',
  category: 'monitoring',
  tier: 'builtin',
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 2, h: 3 },
  maxSize: { w: 12, h: 10 },
  configSchema: {
    fields: [
      {
        key: 'fontSize',
        label: 'Font size',
        type: 'slider',
        default: 13,
        min: 10,
        max: 18,
      },
    ],
  },
  component: () => import('@/components/widgets/TerminalWidget').then(m => ({ default: m.TerminalWidget })),
}
```

### Anti-Patterns to Avoid
- **Creating Terminal outside useEffect:** Causes "Cannot access before initialization" errors in production builds (minified code reorders). Always create in useEffect.
- **Not disposing Terminal on unmount:** Memory leak -- xterm.js allocates a large buffer. Always call `term.dispose()` in cleanup.
- **Calling fitAddon.fit() on hidden/zero-sized containers:** `open()` requires a visible element with dimensions. The FitAddon will return 0x0 cols/rows if the container is hidden.
- **Not overriding user-select: none:** The app's globals.css sets `user-select: none` on all elements. xterm.js text selection will not work without `user-select: text` on the terminal container.
- **Using the old `xterm` package:** The old unscoped `xterm` package is deprecated since v5. Always use `@xterm/xterm`.
- **Sending raw terminal input as WebSocket Binary frames:** The Phase 13 backend expects JSON `{ type: "input", data: "..." }` for text input and JSON `{ type: "resize", cols, rows }` for resize. Plain text is also accepted as a fallback, but JSON is the protocol.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal rendering (ANSI, cursor, scrollback) | Custom ANSI parser + canvas renderer | `@xterm/xterm` | Thousands of ANSI escape sequences, Unicode handling, ligature support, accessibility -- impossible to match |
| Container-to-cols/rows calculation | Custom character measurement + division | `@xterm/addon-fit` | Handles font metrics, padding, scrollbar width, sub-pixel rounding correctly |
| URL detection in terminal output | Regex on terminal buffer | `@xterm/addon-web-links` | Handles URL edge cases (parens, trailing punctuation, Unicode) that regex gets wrong |
| WebSocket reconnection with backoff | Custom retry loop | Adapt `useChatSocket.ts` pattern | Existing pattern with exponential backoff, max retries, cleanup on unmount |

**Key insight:** xterm.js is a complete terminal emulator -- not a text display library. The Terminal + FitAddon + WebLinksAddon trio covers all rendering, sizing, and link detection. The custom code is only WebSocket plumbing, theme mapping, and copy/paste keybindings.

## Common Pitfalls

### Pitfall 1: user-select: none Blocks Terminal Selection
**What goes wrong:** User cannot select text in the terminal for copying. Click-and-drag does nothing.
**Why it happens:** `globals.css` line 5: `*, *::before, *::after { user-select: none; }` applies to ALL elements including the xterm.js canvas/container.
**How to avoid:** Add explicit CSS override on the terminal container:
```css
.terminal-widget .xterm {
  user-select: text;
  -webkit-user-select: text;
}
```
**Warning signs:** Cannot highlight text in terminal with mouse.

### Pitfall 2: Terminal Created Before Container Has Dimensions
**What goes wrong:** `term.open(container)` works but `fitAddon.fit()` returns 0 cols/0 rows, producing an invisible or broken terminal.
**Why it happens:** Widget is lazy-loaded inside Suspense. The container div may not have layout dimensions when the effect runs.
**How to avoid:** Use a ResizeObserver to detect when the container gains dimensions, then call `fitAddon.fit()`. Alternatively, use `requestAnimationFrame` after `open()` to let the browser compute layout first.
**Warning signs:** Terminal appears as a blank area or shows 0x0 in the status bar.

### Pitfall 3: WebSocket Connects Before Terminal Is Ready
**What goes wrong:** Backend sends initial shell prompt before the terminal is opened, data is lost.
**Why it happens:** WebSocket connection starts immediately, but Terminal.open() is async.
**How to avoid:** Only connect WebSocket AFTER `term.open()` and `fitAddon.fit()` complete. Send initial resize immediately after connection.
**Warning signs:** Missing shell prompt, terminal appears blank until user types.

### Pitfall 4: Resize Flood on Widget Drag
**What goes wrong:** During widget resize drag, `fitAddon.fit()` is called 30+ times per second, sending resize commands to the backend, causing shell output glitches.
**Why it happens:** ResizeObserver fires on every pixel change during drag.
**How to avoid:** Debounce ResizeObserver callbacks (100-150ms). Or use `requestAnimationFrame` as a natural throttle. The backend resize handler is idempotent so extra calls just cause visual artifacts, not data loss.
**Warning signs:** Shell output garbles during widget resize, high WebSocket message rate.

### Pitfall 5: Terminal Not Cleaned Up on Widget Remove
**What goes wrong:** User removes terminal widget from dashboard, but WebSocket stays open and PTY session persists until the CAS guard times out.
**Why it happens:** Widget component unmounts but the WebSocket close event is not fired.
**How to avoid:** In the useEffect cleanup function: (1) close WebSocket, (2) dispose Terminal. The backend detects WebSocket close and drops the PTY connection guard, killing the shell.
**Warning signs:** `PTY_CONNECTIONS` counter stays incremented after removing widget.

### Pitfall 6: Theme Not Updating When Blend Slider Changes
**What goes wrong:** User moves the theme blend slider but terminal colors remain unchanged.
**Why it happens:** ITheme is set once on Terminal creation. `getComputedStyle()` values change dynamically but the Terminal doesn't re-read them.
**How to avoid:** Watch for theme changes via `MutationObserver` on `document.documentElement` for `data-theme` attribute changes, or listen to the theme store. Call `term.options.theme = buildThemeFromCSS()` to update.
**Warning signs:** Terminal looks "stuck" in dark theme when user switches to light or changes blend position.

### Pitfall 7: Binary WebSocket Messages Need Uint8Array Conversion
**What goes wrong:** Terminal output appears garbled or encoded.
**Why it happens:** Phase 13 backend sends PTY output as WebSocket Binary messages. The browser receives these as Blob or ArrayBuffer. xterm.js's `write()` accepts `string | Uint8Array`.
**How to avoid:** Check `event.data instanceof Blob` and convert via `arrayBuffer()`. Or set `ws.binaryType = 'arraybuffer'` to receive ArrayBuffer directly, then wrap in `new Uint8Array()`.
**Warning signs:** Terminal shows `[object Blob]` or garbled characters.

## Code Examples

Verified patterns from official sources:

### Complete TerminalWidget Component Structure
```typescript
// Source: Widget pattern from widget-registry.ts + ClockWidget.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { WidgetProps } from '@/lib/widget-registry'

export const TerminalWidget = React.memo(function TerminalWidget({
  widgetId,
  config,
  size,
}: WidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fontSize = (config.fontSize as number) ?? 13

  // useTerminal hook manages Terminal, WebSocket, resize, theme
  const { connected, error } = useTerminal(containerRef, { fontSize })

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Connection banner */}
      {!connected && (
        <div style={{
          padding: '4px 8px',
          fontSize: '11px',
          background: 'var(--bg-elevated)',
          color: error ? 'var(--red)' : 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
        }}>
          {error || 'Connecting...'}
        </div>
      )}

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="terminal-container"
        style={{
          flex: 1,
          padding: '4px',
          overflow: 'hidden',
        }}
      />
    </div>
  )
})
```

### CSS for Terminal Widget
```css
/* Terminal container overrides */
.terminal-container .xterm {
  user-select: text;
  -webkit-user-select: text;
  height: 100%;
}

/* Thin overlay scrollbar matching app aesthetic */
.terminal-container .xterm-viewport::-webkit-scrollbar {
  width: 6px;
}
.terminal-container .xterm-viewport::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
.terminal-container .xterm-viewport::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
.terminal-container .xterm-viewport::-webkit-scrollbar-track {
  background: transparent;
}
```

### WebSocket Binary Type Configuration
```typescript
// Source: Phase 13 backend sends Binary frames for PTY output
const ws = new WebSocket(url)
ws.binaryType = 'arraybuffer' // Receive as ArrayBuffer, not Blob

ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    term.write(new Uint8Array(event.data))
  } else {
    // Fallback for text frames (error messages from backend)
    try {
      const msg = JSON.parse(event.data)
      if (msg.error) {
        // Handle connection error (e.g., "too many terminal sessions")
        setError(msg.error)
      }
    } catch {
      term.write(event.data)
    }
  }
}
```

### Font Size Update on Config Change
```typescript
// Source: xterm.js ITerminalOptions -- options can be changed at runtime
useEffect(() => {
  if (termRef.current) {
    termRef.current.options.fontSize = fontSize
    fitAddonRef.current?.fit() // re-fit after font size change
  }
}, [fontSize])
```

### Click-to-Focus Behavior
```typescript
// Source: CONTEXT.md decision -- click to focus, no auto-focus on mount
// The terminal container gets a click handler, not auto-focus
<div
  ref={containerRef}
  onClick={() => termRef.current?.focus()}
  style={{ cursor: 'text' }}
/>
// DO NOT call term.focus() in useEffect -- this would steal focus on mount
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xterm` unscoped package | `@xterm/xterm` scoped packages | v5 (2023) | Old packages deprecated, security advisory to migrate |
| Canvas renderer addon | DOM renderer (default) or WebGL | v6 (Dec 2023) | Canvas addon removed entirely in v6 |
| `term.setOption()` | `term.options.prop = value` | v5 | Direct property access, no method call needed |
| `term.on('data', cb)` | `term.onData(cb)` | v5 | Event emitter replaced with typed method callbacks |

**Deprecated/outdated:**
- `xterm` and `xterm-addon-*` unscoped packages: deprecated, will not receive updates
- Canvas renderer: removed in v6, use DOM (default) or WebGL
- `setOption()` / `getOption()`: use `term.options` direct property access instead

## Open Questions

1. **Light theme support**
   - What we know: The `buildThemeFromCSS()` function reads CSS variables which change when `data-theme="light"` is active. The ITheme maps will produce different values.
   - What's unclear: Whether the ANSI color palette (black, red, green, etc.) needs completely different values for light vs dark themes, or if the CSS variable mapping handles it naturally.
   - Recommendation: Start with CSS variable mapping. If ANSI colors look wrong on light theme, add a conditional palette swap based on `data-theme` attribute.

2. **xterm.js font loading timing**
   - What we know: The app uses `JetBrains Mono` as `--font-mono`. Web fonts may not be loaded when Terminal.open() is called.
   - What's unclear: Whether xterm.js re-measures characters when the font loads, or if it uses the fallback font metrics permanently.
   - Recommendation: If font rendering looks wrong on first load, call `fitAddon.fit()` after a brief delay or on `document.fonts.ready`.

3. **Widget size vs character grid alignment**
   - What we know: FitAddon calculates cols/rows from available pixel space. Widget grid cell size is 80px row height. A 4w x 5h widget is roughly 80x24 characters.
   - What's unclear: Exact character count depends on font size, padding, and browser rendering.
   - Recommendation: Do not try to force exact 80x24 -- let FitAddon calculate the best fit. The backend handles any cols/rows values.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x + jsdom |
| Config file | frontend/vitest.config.ts |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose src/lib/__tests__/terminal-theme.test.ts src/hooks/__tests__/useTerminal.test.ts` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-22-a | buildThemeFromCSS returns valid ITheme with all required fields | unit | `cd frontend && npx vitest run src/lib/__tests__/terminal-theme.test.ts -x` | Wave 0 |
| MH-22-b | Terminal renders in widget container | integration | Manual -- requires browser DOM with canvas support (jsdom lacks it) | manual-only |
| MH-22-c | Resize sends correct JSON to WebSocket | unit | `cd frontend && npx vitest run src/hooks/__tests__/useTerminal.test.ts -x` | Wave 0 |
| MH-22-d | Copy/paste keybinding handler returns correct boolean | unit | `cd frontend && npx vitest run src/hooks/__tests__/useTerminal.test.ts -x` | Wave 0 |
| MH-22-e | Widget registration has correct configSchema | unit | `cd frontend && npx vitest run src/lib/__tests__/widget-registry.test.ts -x` | Existing (extend) |
| MH-22-f | Terminal visually renders with ANSI colors + resize | e2e | Manual -- requires running Tauri backend with PTY | manual-only (requires backend) |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/lib/__tests__/terminal-theme.test.ts src/hooks/__tests__/useTerminal.test.ts`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/lib/terminal-theme.ts` -- CSS-to-ITheme mapping, new file
- [ ] `frontend/src/lib/__tests__/terminal-theme.test.ts` -- covers MH-22-a
- [ ] `frontend/src/hooks/__tests__/useTerminal.test.ts` -- covers MH-22-c, MH-22-d (mock WebSocket + Terminal)
- [ ] `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` npm install -- required before imports compile
- [ ] Extend `widget-registry.test.ts` to verify terminal widget definition

## Sources

### Primary (HIGH confidence)
- [xterm.js ITerminalOptions](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/) -- All constructor options: cursorStyle, cursorBlink, fontSize, fontFamily, scrollback, theme, allowProposedApi
- [xterm.js Terminal class](https://xtermjs.org/docs/api/terminal/classes/terminal/) -- Methods: open(), write(), dispose(), getSelection(), paste(), onData(), onBinary(), onResize(), resize(), loadAddon(), attachCustomKeyEventHandler()
- [xterm.js ITheme interface](https://xtermjs.org/docs/api/terminal/interfaces/itheme/) -- 28 color properties verified: background, foreground, cursor, cursorAccent, selection*, scrollbar*, ANSI 16-color palette
- [xterm.js importing guide](https://xtermjs.org/docs/guides/import/) -- CSS path: `@xterm/xterm/css/xterm.css`
- Phase 13 backend (`src-tauri/src/routes/terminal.rs`) -- WebSocket protocol verified: JSON `{type: "resize", cols, rows}`, `{type: "input", data}`, Binary output frames
- Existing codebase: `widget-registry.ts`, `useChatSocket.ts`, `WidgetWrapper.tsx`, `DashboardGrid.tsx`, `globals.css`

### Secondary (MEDIUM confidence)
- [xterm.js GitHub issue #2478](https://github.com/xtermjs/xterm.js/issues/2478) -- Copy/paste implementation pattern with `attachCustomKeyEventHandler`
- [xterm.js GitHub issue #4283](https://github.com/xtermjs/xterm.js/issues/4283) -- React integration patterns and pitfalls
- [xterm.js GitHub releases](https://github.com/xtermjs/xterm.js/releases) -- v6.0.0 changelog: canvas renderer removed, ESM support, scoped packages
- [@xterm/addon-fit npm](https://www.npmjs.com/package/@xterm/addon-fit) -- v0.11.0 confirmed
- [@xterm/addon-web-links npm](https://www.npmjs.com/package/@xterm/addon-web-links) -- v0.12.0 confirmed

### Tertiary (LOW confidence)
- xterm.js bundle size (~200-250KB minified, ~70-80KB gzipped) -- from training data, not independently verified for v6

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- @xterm/xterm is the only serious web terminal library; versions verified via npm
- Architecture: HIGH -- Widget system patterns extracted from codebase, WebSocket protocol verified against Phase 13 implementation, xterm.js API verified via official docs
- Pitfalls: HIGH -- user-select issue verified in globals.css, React lifecycle pitfalls documented in official GitHub issues, binary WebSocket handling verified against Phase 13 code

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (30 days -- xterm.js v6 is stable, widget system unlikely to change)
