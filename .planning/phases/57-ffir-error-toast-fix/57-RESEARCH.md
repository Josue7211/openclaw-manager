# Phase 57: ffir Error Toast Fix - Research

**Researched:** 2026-03-24
**Domain:** Tauri v2 runtime error debugging / frontend error display
**Confidence:** MEDIUM (root cause hypothesized but not runtime-verified)

## Summary

The "ffir" error toast ("Executable not found: 'ffir'") appears on every page load in Tauri mode. An exhaustive search of the entire codebase -- frontend (TypeScript/React), backend (Rust/Axum), Tauri configuration, lock files, TOML, JSON, YAML, and environment files -- confirms the string "ffir" does NOT appear anywhere in source code. The binary `ffir` does not exist on the system PATH either.

The error surfaces as a toast/banner in the Tauri webview. The custom `Toast` component (`components/ui/Toast.tsx`) is only used in `WizardConnectionTest.tsx` and would not fire on regular page loads. This means the error is surfacing through one of: (1) the Tauri WebView's native error overlay, (2) an unhandled promise rejection from a Tauri IPC `invoke()` call, (3) the `ErrorBoundary` or `PageErrorBoundary` components, or (4) a console error that the Tauri debug webview renders visually.

**Primary recommendation:** This requires runtime debugging. Add a temporary global `unhandledrejection` listener in `main.tsx` and a `console.error` interceptor to capture the full stack trace of the "ffir" error. The stack trace will reveal which code path produces it. Once identified, guard or remove the offending call. Without runtime access, the most likely culprits are: a Tauri plugin initialization (shell or notification), an auto-started subprocess from the `commands.rs` color scheme monitor, or a stale Tauri build artifact.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEV-02 | Persistent "ffir" error toast resolved -- no error toasts on clean page load | Runtime debugging strategy documented; all code paths that could surface errors identified; guard/removal patterns ready |
</phase_requirements>

## Standard Stack

No new libraries needed. This is a debugging and removal/guard phase using existing tools.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.0 | Frontend test runner | Already configured in project |
| @tauri-apps/api | 2.x | Tauri IPC bridge | Already in use -- `invoke()` calls may be the error source |
| tauri-plugin-shell | 2.x | Shell open functionality | Only plugin with external process interaction |

## Architecture Patterns

### Error Display Paths in the App

There are exactly 5 ways an error can appear visually to the user:

1. **Toast component** (`components/ui/Toast.tsx`) -- only used in `WizardConnectionTest.tsx`. NOT the source unless the wizard is open.

2. **ErrorBoundary** (`components/ErrorBoundary.tsx`) -- wraps the entire app. Shows error message with a reload button. Catches React render errors only.

3. **PageErrorBoundary** (`components/PageErrorBoundary.tsx`) -- wraps each page's `<Outlet>`. Shows per-page error with retry. Also render errors only.

4. **BackendErrorBanner** (`components/BackendErrorBanner.tsx`) -- inline banner for unreachable services. Shows "Backend unreachable -- showing cached data."

5. **Tauri WebView native error** -- the WebKitGTK webview can display JavaScript errors as an overlay or toast when they are unhandled. This is the most likely vector for "ffir".

### Tauri IPC Calls That Run on Every Page Load

In `main.tsx`, these run when `window.__TAURI_INTERNALS__` is truthy:

```typescript
// 1. Focus manager -- getCurrentWindow().onFocusChanged()
// 2. Decorations -- getCurrentWindow().setDecorations(false)
// 3. Theme detection -- invoke('detect_system_dark_mode'), invoke('detect_gtk_theme')
// 4. Wallbash colors -- invoke('read_wallbash_colors'), invoke('read_theme_conf')
// 5. API key -- invoke('get_secret', { key: 'mc-api-key' })
// 6. Wallbash event listeners -- listen('wallbash-theme-update'), listen('gsettings-color-scheme-changed')
// 7. GTK theme polling interval (3s)
```

All of these have `.catch()` handlers that silently swallow errors. None would produce a visible toast. However, if ANY of these calls fail with an error that escapes the catch block (e.g., the Tauri plugin internals throw before the Promise is created), it could appear as an unhandled rejection.

### Rust Process Spawning on Startup

In `main.rs setup()`, these spawn on app start:
- `start_wallbash_watcher()` -- watches `~/.config/hypr/themes/` for file changes
- `start_color_scheme_monitor()` -- spawns `gsettings monitor org.gnome.desktop.interface color-scheme`

In `server.rs start()`:
- `tailscale::startup_verify()` -- runs `tailscale status --json`
- Messages prewarm -- calls BlueBubbles API (no subprocess)

None of these reference "ffir" but any subprocess failure could produce garbled output.

### Anti-Patterns to Avoid
- **Suppressing the error without finding the root cause** -- just hiding the toast without understanding what produces it will leave a broken code path silently failing.
- **Grepping for "ffir" in source and concluding it's external** -- already done by Phase 19.1 research. The phase must do runtime debugging to find the actual source.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stack trace capture | Manual try/catch wrapping | `window.addEventListener('unhandledrejection', ...)` | Catches ALL unhandled promise rejections globally |
| Error interception | Custom console wrapper | Temporary `console.error` monkey-patch | Captures the original stack before any framework processing |

## Common Pitfalls

### Pitfall 1: Assuming the error is in source code
**What goes wrong:** Developers search the codebase for "ffir", find nothing, and conclude it's an external system issue.
**Why it happens:** The string may be dynamically constructed, base64-decoded, or produced by a Tauri plugin's internal error path that doesn't exist in the app's source.
**How to avoid:** Runtime debugging with stack traces is the ONLY reliable approach. Add the unhandledrejection listener, reproduce the error, and read the stack.
**Warning signs:** When code search finds zero results for a persistent visible error.

### Pitfall 2: Confusing Tauri WebView errors with app Toast errors
**What goes wrong:** The "error toast" the user sees might not be the custom `Toast` component at all -- it could be a WebKitGTK error popup, a Tauri dev-mode error overlay, or a browser console error that renders visually.
**Why it happens:** Tauri's WebKitGTK webview on Linux can surface JavaScript errors as floating overlays in dev mode.
**How to avoid:** Check whether the visual appearance matches the custom Toast component (uses `var(--bg-card-solid)`, border-radius `var(--radius-lg)`) or a native browser error dialog.
**Warning signs:** Error appears even when ToastProvider is not in the render tree.

### Pitfall 3: Stale build artifacts
**What goes wrong:** A previous Tauri build cached a binary reference or generated code that includes "ffir".
**Why it happens:** `cargo tauri dev` does not always recompile cleanly. CLAUDE.md notes: "cargo tauri dev doesn't always recompile after editing .rs files."
**How to avoid:** Run `cargo clean -p mission-control` before debugging to eliminate stale artifacts.
**Warning signs:** Error disappears after clean rebuild.

### Pitfall 4: Removing error display without fixing the root cause
**What goes wrong:** The error surface is suppressed (e.g., catching and ignoring it) but the underlying failed operation still fails silently.
**Why it happens:** Pressure to close the bug without understanding it.
**How to avoid:** The fix must either (a) remove the code that calls the nonexistent binary, or (b) guard it with an availability check that skips gracefully. Simply swallowing the error is not acceptable.

## Code Examples

### Pattern 1: Global unhandled rejection listener for debugging
```typescript
// Add temporarily in main.tsx BEFORE any other code
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const msg = reason?.message || String(reason)
  if (msg.includes('ffir') || msg.includes('Executable')) {
    console.error('[FFIR DEBUG] Unhandled rejection:', reason)
    console.error('[FFIR DEBUG] Stack:', reason?.stack)
    // Prevent the error from showing in the webview
    event.preventDefault()
  }
})
```

### Pattern 2: Console.error interceptor
```typescript
// Temporary -- captures ALL console.error calls with stack context
const _origError = console.error
console.error = (...args: unknown[]) => {
  const joined = args.map(a => String(a)).join(' ')
  if (joined.includes('ffir') || joined.includes('Executable')) {
    _origError('[FFIR CAPTURED]', ...args)
    _origError('[FFIR STACK]', new Error().stack)
  }
  _origError(...args)
}
```

### Pattern 3: Conditional guard for subprocess calls
```rust
// If the root cause is a Rust subprocess call, guard with which/command check
use std::process::Command;

fn is_binary_available(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
```

### Pattern 4: Frontend guard for Tauri command
```typescript
// If the root cause is a Tauri invoke() call, guard properly
try {
  const result = await invoke('some_command')
  // use result
} catch (err) {
  // Only log, never surface as toast
  console.debug('Command unavailable:', err)
}
```

## Investigation Strategy

The following strategy should be used during plan execution since the root cause cannot be determined from code analysis alone.

### Step 1: Clean build
```bash
cd src-tauri && cargo clean -p mission-control
cargo tauri dev
```

### Step 2: Add debug interceptors
Add the `unhandledrejection` listener and `console.error` interceptor to `main.tsx` (before any other code).

### Step 3: Reproduce and capture
Load any page. The "ffir" error should appear. The interceptor will log:
- The exact error message
- The full stack trace
- The originating module/file

### Step 4: Trace to root cause
The stack trace will point to one of:
- A Tauri plugin initialization (fix: remove or guard the plugin)
- A Tauri IPC `invoke()` call (fix: add catch or remove the call)
- A Rust subprocess spawn (fix: add binary availability check)
- A JavaScript runtime error (fix: remove the offending code)

### Step 5: Fix and verify
Apply the fix (removal or conditional guard), remove the debug interceptors, verify zero error toasts on clean page load across multiple pages.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEV-02 | No error toasts on clean page load | unit + manual | `cd frontend && npx vitest run src/components/ui/__tests__/Toast.test.tsx -x` | Yes (existing) |
| DEV-02 | Error interceptor captures ffir | manual | Runtime in Tauri dev mode | N/A |
| DEV-02 | Fix removes/guards offending code | unit | Depends on root cause -- Wave 0 after discovery | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- Test for the fix itself cannot be written until the root cause is identified
- The existing Toast.test.tsx covers the toast component but not the error source
- A regression test should be added once the root cause is found

## Open Questions

1. **What does the error toast look like visually?**
   - What we know: User reports "Executable not found: 'ffir'" as an error toast on every page load
   - What's unclear: Is it the custom Toast component, a Tauri native error overlay, or a WebKitGTK dialog?
   - Recommendation: Screenshot comparison during runtime debugging

2. **Is the error from Tauri mode only or also browser mode?**
   - What we know: The error was reported during Tauri app usage. Browser mode (`npm run dev`) skips all `__TAURI_INTERNALS__` code paths.
   - What's unclear: Whether the error only appears in Tauri mode
   - Recommendation: Test both modes during investigation

3. **Could this be a stale build artifact?**
   - What we know: `cargo tauri dev` does not always recompile cleanly per CLAUDE.md
   - What's unclear: Whether a clean rebuild resolves the issue
   - Recommendation: Test with `cargo clean -p mission-control` first

## Sources

### Primary (HIGH confidence)
- Codebase search: exhaustive grep of all `*.rs`, `*.ts`, `*.tsx`, `*.json`, `*.toml`, `*.lock`, `*.yaml` files -- zero "ffir" matches outside `.planning/` docs
- System PATH search: `which ffir` and `find /usr/bin /usr/local/bin ~/.local/bin -name "ffir*"` -- no binary found
- `src-tauri/capabilities/default.json` -- only shell permission is `shell:allow-open` for HTTPS URLs
- `src-tauri/tauri.conf.json` -- no `externalBin` or sidecar configuration
- `frontend/src/main.tsx` -- all Tauri IPC calls have `.catch()` handlers

### Secondary (MEDIUM confidence)
- Phase 19.1 research (`19.1-RESEARCH.md`) -- independently confirmed "ffir" not in codebase, flagged as runtime investigation needed
- User memory (`project_v003_postship_bugs.md`) -- exact error text: "Executable not found: 'ffir'"
- Tauri plugin-shell v2 source (`error.rs`) -- no "Executable not found" error variant exists in the plugin

### Tertiary (LOW confidence)
- Hypothesis that error comes from WebKitGTK webview native overlay -- needs runtime verification
- Hypothesis about stale build artifacts -- needs `cargo clean` test

## Metadata

**Confidence breakdown:**
- Root cause identification: LOW -- requires runtime debugging, cannot determine from static analysis
- Investigation strategy: HIGH -- comprehensive interception approach will capture the error
- Fix patterns: HIGH -- once root cause is found, the guard/removal patterns are straightforward
- Architecture understanding: HIGH -- all error display paths and Tauri IPC calls fully mapped

**Research date:** 2026-03-24
**Valid until:** 2026-04-07 (stable -- error source is in existing code, not a moving target)
