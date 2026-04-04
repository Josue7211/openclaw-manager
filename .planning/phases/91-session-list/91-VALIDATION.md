---
phase: 91
slug: session-list
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 91 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + cargo test |
| **Config file** | frontend/vitest.config.ts, src-tauri/Cargo.toml |
| **Quick run command** | `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20` |
| **Full suite command** | `cd frontend && npx vitest run && CARGO_TARGET_DIR=/tmp/mc-target cargo test --manifest-path src-tauri/Cargo.toml` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After each plan completes:** Run full suite command
- **Before phase sign-off:** Run full suite + cargo clippy + tsc --noEmit

---

## Validation Architecture

### Wave 0: Test Infrastructure (if needed)
- Test infrastructure already exists — vitest configured, cargo test configured
- No new test setup required

### Critical Paths to Validate
1. **Backend route registration** — GET /api/gateway/sessions returns valid JSON
2. **Gateway proxy** — gateway_forward correctly calls sessions.list and returns response
3. **Frontend hook** — useGatewaySessions fetches from /api/gateway/sessions and returns typed data
4. **Session list rendering** — SessionsPage renders session cards with label, agent, count, timestamp
5. **Empty state** — When no sessions, shows empty state with "Start a new chat" prompt
6. **Sort order** — Sessions sorted by lastActivity descending

### Acceptance Criteria Mapping
| Requirement | Test Type | Validation Method |
|-------------|-----------|-------------------|
| SESS-01: View session list | Integration + UI | curl /api/gateway/sessions returns JSON array; agent-browser sees session cards |
| Label display | Unit | Test renders session label text |
| Agent name display | Unit | Test renders agent name from agentKey |
| Message count | Unit | Test renders messageCount badge |
| Last activity | Unit | Test renders SecondsAgo with lastActivity |
| Sort order | Unit | Test verifies descending sort by lastActivity |
| Empty state | Unit | Test renders empty state when sessions array is empty |
