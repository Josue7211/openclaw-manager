---
phase: 13-terminal-pty-backend
plan: 01
status: complete
started: 2026-03-23T00:15:00Z
completed: 2026-03-23T00:30:00Z
---

# Phase 13 Plan 01: Terminal PTY Backend — Summary

## What Was Built

WebSocket endpoint at `/api/terminal/ws` that spawns secure PTY sessions with bidirectional I/O relay.

### Files Created/Modified

| File | Action | What |
|------|--------|------|
| `src-tauri/Cargo.toml` | Modified | Added `portable-pty = "0.9"` dependency |
| `src-tauri/Cargo.lock` | Modified | Resolved portable-pty and transitive deps |
| `src-tauri/src/routes/terminal.rs` | Created | Full PTY backend (558 lines) |
| `src-tauri/src/routes/mod.rs` | Modified | Added `pub mod terminal` + `terminal::router()` |

### Key Implementation Details

- **CAS guard**: `PtyConnectionGuard` with `AtomicUsize` CAS loop, max 3 concurrent sessions (429 on 4th)
- **Env sanitization**: `env_clear()` + whitelist of 22 safe vars; 15 blocked prefixes covering all app secrets
- **Shell detection**: `$SHELL` on Unix (fallback `/bin/sh`), `powershell.exe` on Windows
- **Process group kill**: `PtyCleanup` Drop impl: `child.kill()` → `libc::kill(-pgid, SIGKILL)` → `child.wait()`
- **Bidirectional relay**: OS threads for blocking PTY I/O, bridged to async via `tokio::sync::mpsc` channels
- **Terminal protocol**: JSON `TerminalCommand` enum with `resize` and `input` variants; also accepts raw text/binary
- **Auth**: `RequireAuth` extractor on WebSocket upgrade handler

### Decisions Made

- Used `Arc<Mutex<Option<PtyCleanup>>>` to allow resize operations through the master while keeping cleanup on Drop
- Writer thread flushes after each write for keystroke responsiveness
- Slave dropped immediately after spawn to prevent FD leak and EOF hang

## Verification

- 4 unit tests pass: `test_detect_shell`, `test_env_sanitization`, `test_pty_connection_guard`, `test_blocked_prefixes_complete`
- Full test suite: 273 tests pass, 0 failures
- All 16 acceptance criteria verified via grep counts

## Commit

`c06560b` — feat(13): terminal PTY backend with WebSocket relay
