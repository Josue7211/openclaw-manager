---
phase: 14
slug: terminal-frontend-xterm
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | frontend/vitest.config.ts |
| **Quick run command** | `cd frontend && npx vitest run --reporter=verbose 2>&1 \| tail -20` |
| **Full suite command** | `cd frontend && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `cd frontend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | MH-22 | unit | `npx vitest run terminal` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | MH-22 | integration | `npx vitest run terminal` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/hooks/__tests__/useTerminalSocket.test.ts` — stubs for WebSocket hook
- [ ] `frontend/src/components/widgets/__tests__/TerminalWidget.test.tsx` — stubs for widget rendering

*Existing vitest infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ANSI color rendering | MH-22 | Visual rendering check | Open terminal widget, run `ls --color`, verify colors display |
| Copy/paste | MH-22 | Clipboard API + keyboard | Select text with Ctrl+Shift+C, paste with Ctrl+Shift+V |
| Widget resize | MH-22 | react-grid-layout interaction | Drag widget resize handle, verify terminal reflows |
| Scrollback | MH-22 | Visual scroll behavior | Run `seq 1000`, scroll up to verify previous output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
