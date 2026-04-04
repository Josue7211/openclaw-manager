# Codebase Errors — RESOLVED

**Captured:** 2026-03-24
**Resolved:** 2026-03-24
**Context:** v0.0.4 and v0.0.5 were executed without quality gates. Worktree merges introduced errors that were never caught. All issues below have been fixed.

## TypeScript: 0 errors — CLEAN

TSC passes with zero errors.

## Vitest: 0 failures — CLEAN (2519/2519 pass, 128 files)

All 23 test failures across 5 files have been fixed:

1. **useAgents.test.ts** — Added `useGatewaySSE` mock (EventSource unavailable in jsdom)
2. **widget-registry.test.ts** — Updated count from 29 → 33 entries
3. **widget-render-smoke.test.tsx** — Fixed event-bus mock to preserve GATEWAY_EVENT_MAP, removed false positive VncPreview deletion check, added useTerminal mock for xterm
4. **module-smoke.test.tsx** — Added 4 missing page mappings (sessions, remote, approvals, activity) + 9 hook/component mocks
5. **AgentsPage.test.tsx** — Added `useGatewaySSE` mock

## Rust: 0 errors, 0 clippy warnings — CLEAN (289/289 tests pass)

All 75 clippy warnings resolved across 19 files:

- **Dead code removed:** BOOT_EPOCH, boot_epoch, require_str, mime_from_extension
- **Dead code suppressed:** Supabase client methods (#[allow(dead_code)]), verify_peer, PTY_BLOCKED_PREFIXES (#[cfg(test)])
- **Unused imports removed:** 4 files cleaned
- **Code quality fixed:** clamp patterns, unnecessary closures, regex in loop (→ LazyLock), needless borrows, etc.
