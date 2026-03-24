# Codebase Errors — Must Fix Before Continuing

**Captured:** 2026-03-24
**Context:** v0.0.4 and v0.0.5 were executed without quality gates. Worktree merges introduced errors that were never caught.

## TypeScript: 0 compilation errors (clean after agent fix)

TSC now passes. Previous 93 errors were resolved.

## Vitest: 5 failing test files, 22 failing tests

### 1. src/hooks/__tests__/useAgents.test.ts (3 failures)
- `maps a full backend response with all fields populated` — FAIL
- `handles null optional fields without errors` — FAIL
- `returns empty array when backend returns no agents` — FAIL
- **Root cause:** Phase 87 added response shape tests that expect a different Agent interface than what the hook returns. The test mocks return fields the actual API doesn't use, or the types diverged during merge.

### 2. src/lib/__tests__/widget-registry.test.ts (1 failure)
- `has exactly 29 entries` — FAIL
- **Root cause:** Widget count changed during phases 63/73 (noVNC removal, widget cleanup). Test expects 29 but actual count is different.

### 3. src/lib/__tests__/widget-render-smoke.test.tsx (4 failures)
- `all widget component() factories resolve without import errors` — FAIL
- `has no references to deleted components` — FAIL
- `renders "claude-sessions" without throwing` — FAIL
- `renders "openclaw-kpi" without throwing` — FAIL
- **Root cause:** Widget registry has entries for components that don't exist (claude-sessions, openclaw-kpi), or the smoke test expects components that were deleted. The xterm terminal widget also crashes in jsdom.

### 4. src/pages/__tests__/module-smoke.test.tsx (8 failures)
- `every module has a page import mapping` — FAIL
- modules "sessions", "remote-viewer", "approvals", "activity" — page resolve + render failures
- **Root cause:** Module smoke test has mappings for pages that don't exist or were renamed. The "sessions" page may not have a default export, "remote-viewer" was stripped (noVNC), "approvals" and "activity" pages may be stubs.

### 5. src/pages/agents/__tests__/AgentsPage.test.tsx (3 failures)
- `renders without throwing` — FAIL
- `displays both agent names` — FAIL
- `shows empty state text when no agent is selected` — FAIL
- **Root cause:** AgentsPage test expects rendering behavior that doesn't match the actual page component. Likely mock setup issues or the page structure changed during phases.

### + 1 Error
- `widget-render-smoke.test.tsx` — xterm `term.open(container)` fails in jsdom (no real DOM). Terminal widget needs a mock.

## Rust: 0 compilation errors, 13 clippy warnings

### Dead code warnings (pre-existing):
1. `BOOT_EPOCH` static never used (status.rs)
2. `boot_epoch` function never used (status.rs)
3. `PTY_BLOCKED_PREFIXES` constant never used (terminal.rs)
4. `require_str` function never used (util.rs)
5. `mime_from_extension` function never used (util.rs)
6. `select`, `select_single`, `insert`, `upsert`, `update`, `delete` methods never used (supabase.rs)
7. `verify_peer` function never used (tailscale.rs)

### Code quality warnings:
8. Unused imports: `delete as delete_route`, `post`, `delete`, `put` (various routes)
9. Unused variable: `e` (somewhere in routes)
10. Empty line after doc comment (2 instances)
11. Clamp-like pattern without using clamp (1 instance)
12. Unnecessary closure for Result::Err (1 instance)
13. Compiling regex in a loop (1 instance)

## Fix Priority

1. **Test failures** — Fix all 22 failing tests (5 files)
2. **Rust unused imports** — Clean the 4 unused import warnings
3. **Rust dead code** — Either use or remove the 7 dead functions/methods
4. **Rust quality** — Fix the 6 code quality warnings
