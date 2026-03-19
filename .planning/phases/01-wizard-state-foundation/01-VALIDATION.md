---
phase: 1
slug: wizard-state-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts` |
| **Full suite command** | `cd frontend && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts`
- **After every plan wave:** Run `cd frontend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FLOW-01 | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "field values survive"` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | FLOW-02 | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "progress"` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | FLOW-03 | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "skip to demo"` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | FLOW-04 | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "pre-fill"` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 1 | FLOW-05 | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "keychain save"` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 1 | FLOW-06 | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "persistence"` | ❌ W0 | ⬜ pending |
| 01-01-07 | 01 | 1 | FLOW-07 | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "next gated"` | ❌ W0 | ⬜ pending |
| 01-01-08 | 01 | 1 | FLOW-08 | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "auto-test"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/components/__tests__/useWizardState.test.ts` — stubs for FLOW-01 through FLOW-08
- [ ] `frontend/src/components/onboarding/types.ts` — shared type definitions needed before tests can import

*Existing test infrastructure in `frontend/src/lib/__tests__/` fully operational. Only the new wizard-specific test file is missing.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
