# Phase 13: Terminal PTY Backend - Research

**Researched:** 2026-03-22
**Domain:** PTY spawning, WebSocket relay, process lifecycle management (Rust/Axum)
**Confidence:** HIGH

## Summary

This phase adds a secure terminal backend to the Tauri app: spawning PTY sessions, relaying I/O over WebSocket, enforcing connection limits, sanitizing the environment, and cleaning up process groups on close. The codebase already has strong patterns for every building block -- axum WebSocket handling (chat.rs), CAS connection guards (chat.rs), environment sanitization (pipeline/helpers.rs), and process group management (pipeline/helpers.rs). The new route module (`terminal.rs`) follows these established patterns closely.

The recommended PTY crate is **portable-pty** (v0.9.0), the same crate used by wezterm. It provides cross-platform support (Unix PTY + Windows ConPTY), a `CommandBuilder` with `env_clear()`/`env_remove()`, `MasterPty::resize()` for SIGWINCH, and `process_group_leader()` for PID-based cleanup. No other crate offers this combination.

**Primary recommendation:** Add `portable-pty = "0.9"` to Cargo.toml. Build `terminal.rs` following the chat.rs WebSocket + CAS guard pattern, with env sanitization from pipeline/helpers.rs and process group kill on drop.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-21 | Terminal PTY Backend: WebSocket endpoint spawning PTY, CAS guard (max 3), zero orphan processes, env sanitization, cross-platform shell detection | portable-pty API (CommandBuilder, MasterPty, process_group_leader), chat.rs CAS guard pattern, pipeline/helpers.rs env_clear pattern, SHELL/COMSPEC detection |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| portable-pty | 0.9 | Cross-platform PTY spawning | Used by wezterm; only Rust crate with Unix + Windows ConPTY + resize + process_group_leader |
| axum (ws feature) | 0.7 (already in Cargo.toml) | WebSocket endpoint | Already used for chat.rs WebSocket relay |
| tokio | 1 (already in Cargo.toml, has `process` + `io-util` features) | Async runtime, spawn_blocking for PTY I/O | Already the project runtime |
| libc | 0.2 (already in Cargo.toml) | kill(-pgid, SIGKILL) for process group cleanup | Already a dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nix | 0.28 (transitive via portable-pty) | Low-level Unix PTY operations | Pulled in by portable-pty, not needed directly |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| portable-pty | pty-process | Has async support via tokio but Unix-only, no Windows ConPTY |
| portable-pty | nix::pty directly | Lower-level, manual everything, no Windows support |
| portable-pty | pseudoterminal crate | Newer but less battle-tested than wezterm's crate |

**Installation:**
```bash
cd src-tauri && cargo add portable-pty@0.9
```

**Note:** portable-pty's I/O is synchronous (`Read`/`Write` traits). Use `tokio::task::spawn_blocking` for the read loop and `tokio::task::spawn_blocking` or a dedicated thread for writes. The codebase already has the `tokio` features needed (`io-util`, `process`, `rt-multi-thread`).

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/routes/
├── terminal.rs          # NEW: PTY WebSocket endpoint + session manager
├── mod.rs               # Add: pub mod terminal; + .merge(terminal::router())
└── ... (existing)
```

### Pattern 1: CAS Connection Guard (from chat.rs)
**What:** Atomic compare-and-swap to limit concurrent connections with RAII cleanup.
**When to use:** Always -- enforces the max 3 PTY sessions requirement.
**Example:**
```rust
// Source: src-tauri/src/routes/chat.rs lines 21-76
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
**What:** Axum WebSocket upgrade with RequireAuth, connection guard, and message size limits.
**When to use:** The `/api/terminal/ws` endpoint.
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

    ws.max_message_size(64 * 1024)
      .on_upgrade(move |socket| handle_terminal_ws(socket, state, guard))
}
```

### Pattern 3: Environment Sanitization (from pipeline/helpers.rs)
**What:** Clear all env vars, then whitelist only safe system vars.
**When to use:** Before spawning the PTY shell.
**Example:**
```rust
// Source: src-tauri/src/routes/pipeline/helpers.rs lines 209-232
// For terminal PTY: use portable-pty's CommandBuilder which has env_clear()

fn build_pty_command() -> CommandBuilder {
    let shell = detect_shell();
    let mut cmd = CommandBuilder::new(&shell);

    // Start with clean environment
    cmd.env_clear();

    // Whitelist only safe system variables
    let safe_vars = ["HOME", "USER", "PATH", "SHELL", "TERM", "LANG",
                     "LC_ALL", "LC_CTYPE", "LOGNAME", "DISPLAY",
                     "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR"];
    for key in safe_vars {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }

    // Force TERM to xterm-256color for proper terminal emulation
    cmd.env("TERM", "xterm-256color");

    cmd
}
```

### Pattern 4: Process Group Kill on Drop
**What:** RAII struct that kills the entire PTY process group when dropped.
**When to use:** Wrap the PTY child handle so WebSocket disconnect triggers cleanup.
**Example:**
```rust
// Derived from: pipeline/helpers.rs process_group(0) pattern + portable-pty API
struct PtySession {
    child: Box<dyn Child + Send>,
    master: Box<dyn MasterPty + Send>,
    /// Process group leader PID for group kill
    pgid: Option<i32>,
}

impl Drop for PtySession {
    fn drop(&mut self) {
        // First try graceful kill via portable-pty
        let _ = self.child.kill();

        // Then kill the entire process group (catches subprocesses)
        #[cfg(unix)]
        if let Some(pgid) = self.pgid {
            unsafe {
                libc::kill(-pgid, libc::SIGKILL);
            }
        }

        // Wait to reap zombie
        let _ = self.child.wait();
    }
}
```

### Pattern 5: Bidirectional WebSocket-PTY Relay
**What:** Split the WebSocket, spawn two tasks: one reads PTY output and sends to WS, one reads WS input and writes to PTY.
**When to use:** The main handler after WebSocket upgrade.
**Example:**
```rust
async fn handle_terminal_ws(socket: WebSocket, state: AppState, _guard: PtyConnectionGuard) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Spawn PTY
    let pty_system = portable_pty::native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: 24, cols: 80, pixel_width: 0, pixel_height: 0,
    }) {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("Failed to open PTY: {e}");
            return;
        }
    };

    let cmd = build_pty_command();
    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Failed to spawn shell: {e}");
            return;
        }
    };
    // Drop slave -- not needed after spawn
    drop(pair.slave);

    let pgid = pair.master.process_group_leader();
    let reader = pair.master.try_clone_reader().unwrap();
    let writer = pair.master.take_writer().unwrap();

    let session = Arc::new(Mutex::new(PtySession { child, master: pair.master, pgid }));

    // Task 1: PTY stdout -> WebSocket (spawn_blocking because Read is sync)
    let session_clone = session.clone();
    let read_task = tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            let reader_clone = /* clone or Arc the reader */;
            let n = tokio::task::spawn_blocking(move || reader_clone.read(&mut buf))
                .await.unwrap_or(Ok(0)).unwrap_or(0);
            if n == 0 { break; }
            if ws_sender.send(Message::Binary(buf[..n].to_vec())).await.is_err() {
                break;
            }
        }
    });

    // Task 2: WebSocket -> PTY stdin
    let write_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Binary(data) | Message::Text(data) => {
                    // Write to PTY (spawn_blocking)
                },
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Wait for either task to finish, then cleanup
    tokio::select! {
        _ = read_task => {},
        _ = write_task => {},
    }
    // PtySession Drop handles process group kill
}
```

### Anti-Patterns to Avoid
- **Leaking PTY file descriptors:** Always `drop(pair.slave)` after `spawn_command()` -- keeping the slave open prevents the PTY from detecting EOF when the child exits.
- **Using tokio::process for PTY I/O:** portable-pty returns `Box<dyn Read>` / `Box<dyn Write>` which are sync. Wrapping in `spawn_blocking` is correct; do NOT try to use `AsyncRead` adapters.
- **Forgetting process group kill:** `child.kill()` only kills the immediate shell, not subprocesses (vim, htop, etc.). Must use `kill(-pgid, SIGKILL)` on Unix.
- **Passing all env vars:** Never inherit the full process environment. The Tauri process has `MC_API_KEY`, `SUPABASE_*`, `OPENCLAW_*`, `COUCHDB_*`, `BLUEBUBBLES_*` secrets loaded via dotenvy. These MUST NOT leak to the PTY.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform PTY | Manual `forkpty()`/ConPTY | `portable-pty` | Windows ConPTY API is complex; Unix has multiple pty flavors |
| Terminal resize | Manual `ioctl(TIOCSWINSZ)` | `MasterPty::resize(PtySize)` | portable-pty handles platform differences |
| Connection limiting | Mutex-based counter | `AtomicUsize` CAS loop + RAII guard | Pattern already proven in chat.rs, lock-free |
| Process group kill | Manual `waitpid` loops | `kill(-pgid, SIGKILL)` + `child.wait()` | Standard POSIX pattern, portable-pty provides `process_group_leader()` |
| Shell detection | Hardcoded paths | `$SHELL` (Unix) / `COMSPEC` or PowerShell (Windows) | Must respect user's configured shell |

**Key insight:** portable-pty's `CommandBuilder` has `env_clear()` and `env()` methods that mirror `std::process::Command`, making the existing pipeline/helpers.rs sanitization pattern directly applicable.

## Common Pitfalls

### Pitfall 1: PTY Slave File Descriptor Leak
**What goes wrong:** If `pair.slave` is not dropped after `spawn_command()`, the PTY never signals EOF when the child process exits. The read loop hangs forever.
**Why it happens:** The slave side must be closed in the parent process so only the child holds it.
**How to avoid:** `drop(pair.slave)` immediately after `spawn_command()` succeeds.
**Warning signs:** PTY read loop never returns 0 bytes even after `exit` command.

### Pitfall 2: Environment Variable Leakage
**What goes wrong:** The PTY shell inherits `MC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENCLAW_API_KEY`, etc.
**Why it happens:** `CommandBuilder` inherits the parent process environment by default unless `env_clear()` is called.
**How to avoid:** Always call `cmd.env_clear()` first, then explicitly whitelist safe variables. The codebase already does this in `pipeline/helpers.rs` -- follow the same pattern.
**Warning signs:** Running `env` in the terminal shows secrets.

### Pitfall 3: Orphaned Processes After WebSocket Disconnect
**What goes wrong:** User closes terminal tab, WebSocket drops, but vim/htop/long-running commands keep running.
**Why it happens:** `child.kill()` only sends SIGKILL to the shell, not its child processes. On Unix, child processes are re-parented to PID 1.
**How to avoid:** Use `process_group_leader()` to get the PGID, then `kill(-pgid, SIGKILL)` to kill the entire process group. Wrap in a Drop impl.
**Warning signs:** `ps aux` shows orphaned processes after terminal close.

### Pitfall 4: Blocking the Tokio Runtime
**What goes wrong:** Calling `reader.read()` or `writer.write()` directly in an async context blocks the tokio thread pool.
**Why it happens:** portable-pty returns `Box<dyn Read + Send>` and `Box<dyn Write + Send>` -- these are synchronous I/O.
**How to avoid:** Use `tokio::task::spawn_blocking` for read operations. For writes, either use `spawn_blocking` or a dedicated OS thread.
**Warning signs:** App becomes unresponsive when terminal is active; other WebSocket connections stall.

### Pitfall 5: Missing TERM Environment Variable
**What goes wrong:** Programs like vim, htop, tmux fail or display garbage.
**Why it happens:** After `env_clear()`, TERM is not set. Programs can't determine terminal capabilities.
**How to avoid:** Always set `cmd.env("TERM", "xterm-256color")` after clearing. This matches what xterm.js (Phase 14) will advertise.
**Warning signs:** "unknown terminal type" errors, garbled output.

### Pitfall 6: WebSocket Message Type Mismatch
**What goes wrong:** PTY output arrives garbled or is silently dropped.
**Why it happens:** PTY output is raw bytes (potentially non-UTF-8). Sending as `Message::Text` will fail UTF-8 validation. Must use `Message::Binary`.
**How to avoid:** Send PTY output as `Message::Binary`. Accept both `Message::Text` (for typed input) and `Message::Binary` (for paste) on input. Handle resize commands as JSON text messages.
**Warning signs:** Non-ASCII characters or ANSI escape sequences cause connection drops.

### Pitfall 7: Race Between PTY Exit and Read Loop
**What goes wrong:** Child exits but read loop tries to read, gets error, may panic.
**Why it happens:** There's a race between the child process exiting and the last bytes being read from the PTY.
**How to avoid:** Read loop should handle `Ok(0)` (EOF) and `Err(_)` gracefully by breaking. Check `child.try_wait()` after read returns 0.
**Warning signs:** Spurious errors in logs when terminals are closed.

## Code Examples

### Shell Detection (Cross-Platform)
```rust
// No external source -- standard POSIX/Windows pattern
fn detect_shell() -> String {
    #[cfg(unix)]
    {
        // Prefer $SHELL (user's configured login shell)
        if let Ok(shell) = std::env::var("SHELL") {
            if !shell.is_empty() {
                return shell;
            }
        }
        // Fallback: check /etc/passwd (would require parsing)
        // Final fallback
        "/bin/sh".to_string()
    }

    #[cfg(windows)]
    {
        // Prefer PowerShell (modern Windows)
        if let Ok(pwsh) = std::env::var("COMSPEC") {
            // COMSPEC usually points to cmd.exe; prefer PowerShell
        }
        // Check if pwsh.exe (PowerShell 7+) is on PATH
        if which::which("pwsh").is_ok() {
            return "pwsh".to_string();
        }
        // Fall back to PowerShell 5 (Windows PowerShell)
        if which::which("powershell").is_ok() {
            return "powershell".to_string();
        }
        // Last resort: cmd.exe
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }
}
```

**Note on Windows shell detection:** The crate `which` is NOT currently in Cargo.toml. For simplicity, use `std::process::Command::new("pwsh").arg("--version").output()` to probe, or just default to `powershell.exe` since Windows 10+ always has it. Since the primary platform is Linux (CachyOS), Windows shell detection is lower priority.

### Environment Sanitization Constants
```rust
/// Environment variables that are safe to pass through to the PTY.
/// These are non-secret system variables needed for a functional shell.
const PTY_SAFE_ENV_VARS: &[&str] = &[
    "HOME", "USER", "LOGNAME", "PATH", "SHELL", "LANG",
    "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "LC_COLLATE",
    "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR",
    "XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP",
    "DBUS_SESSION_BUS_ADDRESS",
    "SSH_AUTH_SOCK",  // Allow SSH agent forwarding
    "EDITOR", "VISUAL", "PAGER",
    "COLORTERM", "TERM_PROGRAM",
];

/// Environment variable prefixes that MUST be excluded from the PTY.
/// These contain application secrets loaded from the OS keychain.
const PTY_BLOCKED_PREFIXES: &[&str] = &[
    "MC_", "OPENCLAW_", "COUCHDB_", "SUPABASE_",
    "BLUEBUBBLES_", "PROXMOX_", "OPNSENSE_",
    "PLEX_", "CALDAV_", "SONARR_", "RADARR_",
    "EMAIL_", "NTFY_", "MAC_BRIDGE_", "ANTHROPIC_",
];
```

### WebSocket Resize Command Protocol
```rust
// The frontend (xterm.js in Phase 14) will send resize commands as JSON text messages.
// PTY data flows as binary messages.

#[derive(Deserialize)]
#[serde(tag = "type")]
enum TerminalCommand {
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    #[serde(rename = "input")]
    Input { data: String },
}
```

### Route Registration
```rust
// Source pattern: src-tauri/src/routes/mod.rs
// Add to mod.rs:
pub mod terminal;

// In router() function:
.merge(terminal::router())
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `forkpty()` + manual ConPTY | `portable-pty` (trait-based, cross-platform) | 2020+ (wezterm project) | Single API for all platforms |
| `tokio-pty-process` (Unix only) | `portable-pty` + `spawn_blocking` | 2023+ (tokio-pty-process unmaintained) | Windows support, maintained |
| Inherit parent env | `env_clear()` + whitelist | Security best practice | Prevents secret leakage |
| `kill(pid)` for cleanup | `kill(-pgid, SIGKILL)` process group kill | POSIX standard | Catches all subprocesses |

**Deprecated/outdated:**
- `tokio-pty-process`: Last updated 2019, Unix-only, no Windows support
- Manual `libc::forkpty()`: Works but loses portability; portable-pty wraps this

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (Rust stdlib, already configured) |
| Config file | src-tauri/Cargo.toml (test profile implicit) |
| Quick run command | `cd src-tauri && cargo test terminal --lib` |
| Full suite command | `cd src-tauri && cargo test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-21a | Shell detection returns valid path per platform | unit | `cd src-tauri && cargo test terminal::tests::test_detect_shell -x` | Wave 0 |
| MH-21b | Environment sanitization blocks secret prefixes | unit | `cd src-tauri && cargo test terminal::tests::test_env_sanitization -x` | Wave 0 |
| MH-21c | CAS guard enforces max 3 concurrent sessions | unit | `cd src-tauri && cargo test terminal::tests::test_pty_connection_guard -x` | Wave 0 |
| MH-21d | PtySession Drop kills process group | integration | `cd src-tauri && cargo test terminal::tests::test_pty_cleanup -x` | Wave 0 |
| MH-21e | WebSocket endpoint spawns PTY | integration | manual (requires running server) | manual-only |
| MH-21f | 100 open/close cycles leave zero orphans | integration | manual (script-based stress test) | manual-only |

### Sampling Rate
- **Per task commit:** `cd src-tauri && cargo test terminal --lib`
- **Per wave merge:** `cd src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/src/routes/terminal.rs` -- new file with `#[cfg(test)] mod tests` section
- [ ] portable-pty dependency in Cargo.toml
- [ ] Manual stress test script for 100 open/close cycles (can be deferred to verification)

## Open Questions

1. **Windows Shell Detection without `which` crate**
   - What we know: `which` is not in Cargo.toml. PowerShell is always available on Windows 10+.
   - What's unclear: Whether to add `which` or probe via `Command::new("pwsh").output()`.
   - Recommendation: Default to `"powershell.exe"` on Windows. Primary platform is Linux. Add `which` only if Windows testing reveals issues.

2. **portable-pty `take_writer()` Ownership**
   - What we know: `take_writer()` returns `Box<dyn Write + Send>` and can only be called once.
   - What's unclear: How to share the writer between the WebSocket input task and potential resize operations.
   - Recommendation: Use a `tokio::sync::mpsc` channel -- the write task owns the writer and receives both input data and resize commands. Resize goes through `MasterPty::resize()` (separate from the writer).

3. **Read Buffer Size**
   - What we know: PTY output can be bursty (e.g., `cat large_file`).
   - What's unclear: Optimal buffer size for PTY read.
   - Recommendation: Use 4096 bytes (standard terminal buffer size). If performance issues arise, increase to 16384.

## Sources

### Primary (HIGH confidence)
- [portable-pty docs.rs](https://docs.rs/portable-pty/latest/portable_pty/) - Full API: MasterPty, SlavePty, CommandBuilder, PtySystem, PtySize
- [portable-pty CommandBuilder](https://docs.rs/portable-pty/latest/portable_pty/cmdbuilder/struct.CommandBuilder.html) - env_clear, env, env_remove, cwd, set_controlling_tty
- [portable-pty MasterPty](https://docs.rs/portable-pty/latest/portable_pty/trait.MasterPty.html) - resize, try_clone_reader, take_writer, process_group_leader
- Codebase: `src-tauri/src/routes/chat.rs` lines 21-76, 1028-1165 - CAS guard + WebSocket patterns
- Codebase: `src-tauri/src/routes/pipeline/helpers.rs` lines 209-320 - env_clear + process_group(0) patterns
- Codebase: `src-tauri/src/secrets.rs` lines 8-49 - KEY_ENV_MAP showing all secret variable names

### Secondary (MEDIUM confidence)
- [Rust Issue #115241](https://github.com/rust-lang/rust/issues/115241) - Child::kill doesn't kill process groups; use kill(-pgid)
- [portable-pty crates.io](https://crates.io/crates/portable-pty) - Version 0.9.0, part of wezterm
- [setsid(2) man page](https://man7.org/linux/man-pages/man2/setsid.2.html) - Process group session leader
- [pty-process crates.io](https://crates.io/crates/pty-process) - Alternative crate (rejected: Unix-only)

### Tertiary (LOW confidence)
- Windows PowerShell detection approach (based on general knowledge, not verified on Windows)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - portable-pty is well-documented, version verified on docs.rs, all needed APIs confirmed
- Architecture: HIGH - follows exact patterns already in the codebase (chat.rs, pipeline/helpers.rs)
- Pitfalls: HIGH - process group cleanup, env sanitization, and sync I/O wrapping are well-documented concerns
- Windows support: MEDIUM - portable-pty claims ConPTY support but not tested in this project context

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain, portable-pty maintained as part of wezterm)
