# Phase 13: Terminal PTY Backend - Research

**Researched:** 2026-03-22
**Domain:** PTY spawning, WebSocket relay, process lifecycle management (Rust/Axum)
**Confidence:** HIGH

## Summary

Phase 13 requires building a secure PTY backend in Rust that spawns pseudo-terminal sessions via WebSocket. The codebase already has a mature pattern for axum WebSocket endpoints with CAS-based concurrency guards (see `chat.rs`), which can be directly replicated for the terminal module. The `portable-pty` crate (v0.9.0, from the wezterm project) provides a battle-tested cross-platform PTY API covering Linux, macOS, and Windows (ConPTY/WinPTY).

The architecture is straightforward: a new `routes/terminal.rs` module registers a `/terminal/ws` WebSocket endpoint. On upgrade, it acquires a CAS guard (max 3 sessions), spawns a PTY via `portable-pty`, and runs two concurrent loops -- one forwarding PTY output to the WebSocket, one forwarding WebSocket input (including resize commands) to the PTY. On disconnect or error, the RAII guard drops, the PTY master is dropped (closing the file descriptor), and the process group is explicitly killed via `libc::killpg` on Unix or `ChildKiller::kill()` on Windows.

**Primary recommendation:** Use `portable-pty` 0.9.0 with the exact CAS guard pattern from `chat.rs`, `CommandBuilder::new_default_prog()` for cross-platform shell detection, and `libc::killpg(pgid, SIGKILL)` for process group cleanup on Unix.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-21 | Terminal PTY Backend -- PTY spawning, WebSocket relay, CAS guard (max 3), process group cleanup, env sanitization | portable-pty API verified (PtySystem, CommandBuilder, MasterPty, Child, ChildKiller), CAS pattern extracted from chat.rs, env var list extracted from secrets.rs, process group kill pattern documented |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| portable-pty | 0.9.0 | Cross-platform PTY spawning and management | Part of wezterm (production terminal emulator), supports Linux/macOS/Windows, provides CommandBuilder with env sanitization, PtySize for resize, process_group_leader for cleanup |
| axum (ws feature) | 0.7 | WebSocket upgrade and message handling | Already in Cargo.toml with `ws` feature enabled |
| tokio | 1 | Async runtime, `spawn_blocking` for PTY I/O, channels | Already in Cargo.toml with `process`, `sync`, `io-util` features |
| libc | 0.2 | `killpg()` for process group signals on Unix | Already in Cargo.toml |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| serde_json | 1 | Parse resize/control messages from WebSocket | Already in Cargo.toml |
| tracing | 0.1 | Structured logging for PTY lifecycle events | Already in Cargo.toml |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| portable-pty | pty-process | pty-process is Unix-only, no Windows support; portable-pty covers all platforms |
| portable-pty | tokio::process + raw PTY via nix crate | Requires manual PTY setup, no Windows abstraction, more code to maintain |
| libc::killpg | kill_tree crate | External dep for something achievable in 5 lines with libc (already a dependency) |

**Installation:**
```bash
cd src-tauri && cargo add portable-pty@0.9
```

No other new dependencies needed -- axum ws, tokio, libc, serde_json are all already present.

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/routes/
├── terminal.rs          # New: PTY WebSocket endpoint + session management
└── mod.rs               # Add: pub mod terminal; + .merge(terminal::router())
```

### Pattern 1: CAS Connection Guard (from chat.rs)
**What:** Atomic counter with Compare-And-Swap loop + RAII Drop guard
**When to use:** Enforce max concurrent PTY sessions (3)
**Example:**
```rust
// Source: src-tauri/src/routes/chat.rs lines 22-76
use std::sync::atomic::{AtomicUsize, Ordering};

static PTY_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_PTY_CONNECTIONS: usize = 3;

struct PtyConnectionGuard;

impl PtyConnectionGuard {
    fn try_new() -> Option<Self> {
        loop {
            let current = PTY_CONNECTIONS.load(Ordering::Acquire);
            if current >= MAX_PTY_CONNECTIONS {
                return None;
            }
            if PTY_CONNECTIONS.compare_exchange(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ).is_ok() {
                return Some(Self);
            }
        }
    }
}

impl Drop for PtyConnectionGuard {
    fn drop(&mut self) {
        PTY_CONNECTIONS.fetch_sub(1, Ordering::AcqRel);
    }
}
```

### Pattern 2: WebSocket Upgrade Handler (from chat.rs)
**What:** axum WebSocket upgrade with RequireAuth + guard acquisition before upgrade
**When to use:** The `/terminal/ws` endpoint
**Example:**
```rust
// Source: src-tauri/src/routes/chat.rs lines 1028-1048
async fn ws_upgrade(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    ws: WebSocketUpgrade,
) -> Response {
    let guard = match PtyConnectionGuard::try_new() {
        Some(g) => g,
        None => {
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(json!({"error": "too many terminal sessions"})),
            ).into_response();
        }
    };

    ws.on_upgrade(move |socket| handle_terminal_ws(socket, guard))
}
```

### Pattern 3: PTY Spawning with Environment Sanitization
**What:** Spawn a PTY with the user's default shell, stripping sensitive env vars
**When to use:** Inside the WebSocket handler after upgrade
**Example:**
```rust
// Source: portable-pty docs (docs.rs/portable-pty/0.9.0)
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

fn spawn_pty(cols: u16, rows: u16) -> Result<(PtyPair, Box<dyn Child + Send + Sync>), Error> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut cmd = CommandBuilder::new_default_prog();
    // new_default_prog uses $SHELL on Unix, or system default on Windows

    // Sanitize environment: remove all app secrets
    const SENSITIVE_PREFIXES: &[&str] = &[
        "MC_", "OPENCLAW_", "COUCHDB_", "SUPABASE_",
        "BLUEBUBBLES_", "MAC_BRIDGE_", "PROXMOX_",
        "OPNSENSE_", "PLEX_", "ANTHROPIC_", "SONARR_",
        "RADARR_", "CALDAV_", "NTFY_", "EMAIL_",
    ];
    for (key, _) in std::env::vars() {
        if SENSITIVE_PREFIXES.iter().any(|p| key.starts_with(p)) {
            cmd.env_remove(&key);
        }
    }

    // Set standard terminal env
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave.spawn_command(cmd)?;
    Ok((pair, child))
}
```

### Pattern 4: Bidirectional WebSocket <-> PTY Bridge
**What:** Two async tasks: PTY reader -> WS sender, WS receiver -> PTY writer
**When to use:** The core of the terminal session
**Example:**
```rust
// Conceptual pattern -- PTY reader/writer are blocking I/O, must use spawn_blocking
async fn handle_terminal_ws(mut socket: WebSocket, _guard: PtyConnectionGuard) {
    let (pair, mut child) = match spawn_pty(80, 24) {
        Ok(p) => p,
        Err(e) => {
            let _ = socket.send(Message::Text(
                json!({"error": format!("failed to spawn PTY: {e}")}).to_string()
            )).await;
            return;
        }
    };

    let reader = pair.master.try_clone_reader().unwrap();
    let writer = pair.master.take_writer().unwrap();
    // Drop slave -- no longer needed after spawn
    drop(pair.slave);

    let (ws_tx, ws_rx) = socket.split();

    // Task 1: PTY stdout -> WebSocket (blocking read in spawn_blocking)
    // Task 2: WebSocket -> PTY stdin + resize commands
    // On either task ending, kill the process group and clean up
}
```

### Pattern 5: Process Group Kill on Cleanup
**What:** Kill entire process group when PTY session ends
**When to use:** In the cleanup/drop path of the terminal session
**Example:**
```rust
// Unix: kill the process group using the PTY's process_group_leader
#[cfg(unix)]
fn kill_process_group(master: &dyn MasterPty, child: &mut Box<dyn Child + Send + Sync>) {
    if let Some(pgid) = master.process_group_leader() {
        unsafe {
            libc::killpg(pgid, libc::SIGKILL);
        }
    }
    // Fallback: kill the child directly
    let _ = child.kill();
    let _ = child.wait();
}

// Windows: portable-pty's kill() handles ConPTY cleanup
#[cfg(windows)]
fn kill_process_group(child: &mut Box<dyn Child + Send + Sync>) {
    let _ = child.kill();
    let _ = child.wait();
}
```

### Pattern 6: WebSocket Message Protocol
**What:** JSON control messages for resize, binary data for terminal I/O
**When to use:** Frontend <-> backend communication
**Example:**
```rust
// Input from frontend:
// - Binary/Text data: raw terminal input (keystrokes)
// - JSON control: {"type": "resize", "cols": 120, "rows": 40}
//
// Output to frontend:
// - Binary data: raw terminal output (ANSI sequences)
//
// This avoids base64 encoding overhead for terminal data.

#[derive(Deserialize)]
#[serde(tag = "type")]
enum TerminalControl {
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
}
```

### Anti-Patterns to Avoid
- **Dropping the PTY master without killing the process group:** The shell process stays alive as an orphan. Always `killpg()` before dropping.
- **Using `std::process::Command` instead of `CommandBuilder`:** No PTY attachment, the spawned process won't have a controlling terminal, interactive shells won't work.
- **Blocking the tokio runtime with PTY I/O:** `MasterPty::try_clone_reader()` returns a blocking `Read` impl. Always use `tokio::task::spawn_blocking()` or wrap in `tokio::io::AsyncRead`.
- **Inheriting the full process environment:** The PTY child would inherit `MC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and other secrets that are set as process env vars via dotenvy. Always sanitize.
- **Not setting TERM:** Many programs check `$TERM` and fail or produce garbled output without it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform PTY | Raw `openpty()` + `forkpty()` + Windows ConPTY API | `portable-pty` crate | Windows alone has 3 different PTY APIs (WinPTY, ConPTY, legacy console); portable-pty abstracts all of them |
| Shell detection | Parsing `/etc/passwd`, checking `$SHELL`, Windows registry | `CommandBuilder::new_default_prog()` | Already handles `$SHELL` -> password database -> platform default chain |
| CAS guard | Mutex-based counter, semaphore | AtomicUsize CAS loop + RAII Drop | Matches existing codebase pattern (chat.rs), lock-free, zero overhead |
| WebSocket framing | Raw TCP + manual upgrade | axum's `WebSocketUpgrade` | Already in the codebase, handles upgrade negotiation, message framing, ping/pong |

**Key insight:** The only new dependency needed is `portable-pty`. Everything else (WebSocket, CAS guards, auth, error handling) already exists in the codebase and should be reused verbatim.

## Common Pitfalls

### Pitfall 1: Orphaned Processes on WebSocket Disconnect
**What goes wrong:** Client disconnects (network drop, tab close), the WebSocket handler returns, but the shell process and its children keep running forever.
**Why it happens:** Dropping the PTY master FD sends SIGHUP to the foreground process group, but background jobs (e.g. `sleep 1000 &`) are not killed.
**How to avoid:** On cleanup, call `libc::killpg(pgid, SIGKILL)` with the process group leader from `MasterPty::process_group_leader()`. Then `child.wait()` to reap the zombie.
**Warning signs:** `ps aux | grep defunct` showing zombie processes after terminal sessions.

### Pitfall 2: Blocking the Tokio Runtime with PTY I/O
**What goes wrong:** PTY `read()` and `write()` are blocking syscalls. Calling them on the tokio runtime thread pool starves other tasks.
**Why it happens:** `portable-pty`'s `MasterPty::try_clone_reader()` returns `Box<dyn Read>`, not an async reader.
**How to avoid:** Use `tokio::task::spawn_blocking()` for the PTY read loop, or use `tokio::io::AsyncReadExt` with a pipe. Send data between blocking/async worlds via `tokio::sync::mpsc` channels.
**Warning signs:** WebSocket ping/pong timeouts, other HTTP endpoints becoming slow during active terminal sessions.

### Pitfall 3: Environment Variable Leakage
**What goes wrong:** The PTY child process inherits `MC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and other secrets from the parent process environment.
**Why it happens:** dotenvy loads `.env.local` into the process environment at startup. `portable-pty`'s `CommandBuilder` inherits the parent environment by default.
**How to avoid:** Call `cmd.env_remove()` for every sensitive prefix before spawning. Do NOT use `env_clear()` as that removes everything including PATH, HOME, USER, LANG, etc.
**Warning signs:** Running `env | grep MC_` in a spawned terminal showing secrets.

### Pitfall 4: Slave FD Leak
**What goes wrong:** Not dropping `pair.slave` after spawning the child causes the PTY to never receive EOF when the child exits, leading to hung read loops.
**Why it happens:** The slave FD is held open by the parent process, preventing the kernel from signaling EOF to the master.
**How to avoid:** `drop(pair.slave)` immediately after `pair.slave.spawn_command(cmd)`.
**Warning signs:** Terminal sessions that never detect child exit, read loops that block forever.

### Pitfall 5: Windows PowerShell Default
**What goes wrong:** On Windows, `CommandBuilder::new_default_prog()` may spawn `cmd.exe` instead of PowerShell depending on system configuration.
**Why it happens:** Windows doesn't have a `$SHELL` equivalent; the default depends on the system and ConPTY/WinPTY implementation.
**How to avoid:** On Windows, explicitly check for PowerShell: `CommandBuilder::new("powershell.exe")` or `pwsh.exe` for PowerShell 7+. Fall back to `cmd.exe`.
**Warning signs:** Users getting `cmd.exe` when they expected PowerShell.

### Pitfall 6: Resize Race Condition
**What goes wrong:** Resize message arrives before the PTY is fully set up, causing a panic or error.
**Why it happens:** The frontend sends an initial resize immediately on WebSocket open.
**How to avoid:** Buffer the initial size from the WebSocket upgrade query params or first message, use it when creating the PtySize. Only process resize after the PTY is spawned.
**Warning signs:** Intermittent "PTY not initialized" errors on session start.

## Code Examples

Verified patterns from official sources and codebase:

### Spawning a PTY (portable-pty official API)
```rust
// Source: docs.rs/portable-pty/0.9.0/portable_pty
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

let pty_system = native_pty_system();
let pair = pty_system.openpty(PtySize {
    rows: 24,
    cols: 80,
    pixel_width: 0,
    pixel_height: 0,
})?;

let cmd = CommandBuilder::new_default_prog();
let child = pair.slave.spawn_command(cmd)?;
drop(pair.slave); // Critical: drop slave after spawn

let reader = pair.master.try_clone_reader()?;  // Blocking Read
let writer = pair.master.take_writer()?;        // Blocking Write
```

### Resizing a PTY
```rust
// Source: docs.rs/portable-pty/0.9.0/portable_pty/trait.MasterPty.html
pair.master.resize(PtySize {
    rows: new_rows,
    cols: new_cols,
    pixel_width: 0,
    pixel_height: 0,
})?;
```

### Process Group Kill (Unix)
```rust
// Source: MasterPty::process_group_leader() + libc::killpg
#[cfg(unix)]
{
    if let Some(pgid) = master.process_group_leader() {
        // SIGKILL the entire process group
        unsafe { libc::killpg(pgid, libc::SIGKILL); }
    }
}
// Always wait to reap zombie
let _ = child.wait();
```

### WebSocket Upgrade in Axum (existing codebase pattern)
```rust
// Source: src-tauri/src/routes/chat.rs lines 1028-1048
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};

async fn ws_upgrade(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    ws: WebSocketUpgrade,
) -> Response {
    ws.max_message_size(64 * 1024)
       .max_frame_size(64 * 1024)
       .on_upgrade(move |socket| handle_terminal_ws(socket, guard))
}
```

### CAS Guard (existing codebase pattern)
```rust
// Source: src-tauri/src/routes/chat.rs lines 50-76
// Identical pattern used for both ChatSseConnectionGuard and WsConnectionGuard
// Reuse verbatim for PtyConnectionGuard with MAX=3
```

### Environment Sanitization
```rust
// Source: secrets.rs KEY_ENV_MAP (all sensitive env var names)
// Prefixes to strip: MC_, OPENCLAW_, COUCHDB_, SUPABASE_,
// BLUEBUBBLES_, MAC_BRIDGE_, PROXMOX_, OPNSENSE_, PLEX_,
// ANTHROPIC_, SONARR_, RADARR_, CALDAV_, NTFY_, EMAIL_
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WinPTY on Windows | ConPTY (preferred) with WinPTY fallback | Windows 10 1903+ (2019) | portable-pty `native_pty_system()` auto-selects the best available |
| Manual forkpty/openpty | portable-pty abstraction | Stable since 2022 | Cross-platform without conditional compilation |
| Polling PTY output | Blocking read in spawn_blocking + channel | Current best practice | Avoids busy-wait, integrates with tokio |

**Deprecated/outdated:**
- Direct WinPTY usage: ConPTY is the modern Windows PTY API; WinPTY has unfixable bugs
- `pty-process` crate: Unix-only, not suitable for cross-platform Tauri app

## Open Questions

1. **Windows PowerShell version detection**
   - What we know: `CommandBuilder::new_default_prog()` may not pick PowerShell on Windows
   - What's unclear: Whether `pwsh.exe` (PS7) or `powershell.exe` (PS5) should be preferred
   - Recommendation: Check for `pwsh.exe` first (PS7), fall back to `powershell.exe`, then `cmd.exe`. Use `which`/`where` equivalent to detect.

2. **WebSocket message size for terminal output**
   - What we know: chat.rs uses 64KB max message size
   - What's unclear: Whether terminal output bursts (e.g. `cat large_file`) could exceed this
   - Recommendation: Use 64KB chunks for PTY output, fragment larger reads. Terminal emulators handle streaming well.

3. **PTY read buffer size**
   - What we know: Standard practice is 4KB-8KB read buffers for PTY output
   - What's unclear: Optimal size for WebSocket forwarding latency vs throughput
   - Recommendation: Start with 4KB buffer, tune if needed. Lower latency is better for interactive use.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (Rust built-in) |
| Config file | src-tauri/Cargo.toml |
| Quick run command | `cd src-tauri && cargo test terminal -- --nocapture` |
| Full suite command | `cd src-tauri && cargo test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-21-a | CAS guard limits to 3 concurrent sessions | unit | `cd src-tauri && cargo test terminal::tests::cas_guard -x` | Wave 0 |
| MH-21-b | Environment sanitization strips sensitive vars | unit | `cd src-tauri && cargo test terminal::tests::env_sanitization -x` | Wave 0 |
| MH-21-c | Shell detection returns valid shell per platform | unit | `cd src-tauri && cargo test terminal::tests::shell_detection -x` | Wave 0 |
| MH-21-d | Process group kill leaves no orphans | integration | Manual -- spawn PTY, run background job, close session, check `ps` | manual-only (requires PTY, cannot run in CI without TTY) |
| MH-21-e | WebSocket endpoint spawns PTY and relays I/O | integration | Manual -- requires running server + WebSocket client | manual-only (requires full server) |

### Sampling Rate
- **Per task commit:** `cd src-tauri && cargo test terminal`
- **Per wave merge:** `cd src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/src/routes/terminal.rs` -- new file, contains all PTY logic + `#[cfg(test)] mod tests`
- [ ] `portable-pty` dependency in `Cargo.toml` -- required before any tests compile
- [ ] Unit tests for CAS guard (pure logic, no PTY needed)
- [ ] Unit tests for env sanitization (pure logic, mock env)
- [ ] Unit test for shell detection (can verify non-empty string returned)

## Sources

### Primary (HIGH confidence)
- [portable-pty 0.9.0 API docs](https://docs.rs/portable-pty/0.9.0/portable_pty/) - PtySystem, MasterPty, SlavePty, Child, ChildKiller, CommandBuilder, PtySize
- [portable-pty CommandBuilder docs](https://docs.rs/portable-pty/latest/portable_pty/cmdbuilder/struct.CommandBuilder.html) - env, env_clear, env_remove, cwd, new_default_prog, get_shell methods confirmed
- [portable-pty MasterPty docs](https://docs.rs/portable-pty/latest/portable_pty/trait.MasterPty.html) - resize, try_clone_reader, take_writer, process_group_leader methods confirmed
- `src-tauri/src/routes/chat.rs` lines 22-76, 1028-1165 - CAS guard + WebSocket patterns (in-codebase, verified)
- `src-tauri/src/secrets.rs` lines 8-48 - Complete list of sensitive env var mappings (in-codebase, verified)
- `src-tauri/src/server.rs` lines 129-192 - AppState struct, RequireAuth extractor (in-codebase, verified)

### Secondary (MEDIUM confidence)
- [axum WebSocket example](https://github.com/tokio-rs/axum/blob/main/examples/websockets/src/main.rs) - Official axum WebSocket patterns
- [Rust process group kill discussion](https://github.com/rust-lang/rust/issues/115241) - Child::kill limitation, killpg workaround
- [Windows ConPTY blog post](https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/) - ConPTY API design and capabilities

### Tertiary (LOW confidence)
- [wezterm portable-pty discussion #2392](https://github.com/wezterm/wezterm/discussions/2392) - EOF handling in PTY read loops (community discussion)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - portable-pty is the de facto Rust PTY crate, used by wezterm (major terminal emulator). API verified via docs.rs.
- Architecture: HIGH - WebSocket + CAS guard pattern directly extracted from existing codebase (chat.rs). No novel architecture needed.
- Pitfalls: HIGH - Process group orphaning, env leakage, and blocking I/O are well-documented issues with verified mitigations.
- Cross-platform: MEDIUM - Unix (Linux/macOS) path is well-understood. Windows ConPTY path is less tested but portable-pty abstracts it.

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (30 days -- portable-pty is stable, unlikely to change)
