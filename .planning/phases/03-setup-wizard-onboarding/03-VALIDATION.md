---
phase: 3
slug: setup-wizard-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (frontend), cargo test (backend) |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd frontend && npx vitest run && cd ../src-tauri && cargo test` |
| **Estimated runtime** | ~55 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 55 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | WIZARD-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WIZARD-02 | unit + cargo | `npx vitest run && cargo test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WIZARD-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WIZARD-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WIZARD-05 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WIZARD-06 | visual | manual | N/A | ⬜ pending |
| TBD | TBD | TBD | WIZARD-07 | visual | manual | N/A | ⬜ pending |
| TBD | TBD | TBD | WIZARD-08 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/lib/__tests__/wizard-store.test.ts` — stubs for wizard state persistence, step navigation, resume
- [ ] `frontend/src/components/__tests__/SetupWizard.test.tsx` — stubs for step rendering, skip behavior, first-run detection
- [ ] `src-tauri/src/routes/wizard.rs` — test stubs for pre-auth connection test endpoints

*Existing vitest + cargo test infrastructure covers the framework requirement.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wizard full-screen takeover appearance | WIZARD-07 | Visual design quality | Launch app fresh, verify wizard fills entire screen with proper styling |
| Step transition animation quality | WIZARD-07 | Animation smoothness subjective | Navigate between steps, verify morphing card transition is smooth |
| Logo reveal animation | WIZARD-07 | Visual animation quality | Fresh launch, verify radial clip-path wipe with glow halo |
| Connection test with real services | WIZARD-02 | Requires live Tailscale + services | Enter real credentials, verify test passes with latency display |
| Demo mode guided tour | WIZARD-05 | Interactive tooltip positioning | Enter demo mode, verify tooltips point correctly, click-to-advance works |
| Celebration animation | WIZARD-07 | Visual quality | Complete wizard, verify confetti/particle effect |
| Progressive disclosure UX | WIZARD-07 | Subjective design assessment | Walk through all steps, verify nothing feels overwhelming |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 55s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
