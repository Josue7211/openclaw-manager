---
phase: 2
slug: theming-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (frontend), cargo test (backend) |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd frontend && npx vitest run && cd ../src-tauri && cargo test` |
| **Estimated runtime** | ~50 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 50 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | THEME-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | THEME-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | THEME-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | THEME-04 | unit + grep | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | THEME-05 | grep audit | `grep -rn` | ✅ | ⬜ pending |
| TBD | TBD | TBD | THEME-06 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | THEME-07 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | THEME-08 | visual | manual | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/lib/__tests__/theme-engine.test.ts` — stubs for theme state management, mode switching, preset application
- [ ] `frontend/src/lib/__tests__/theme-import-export.test.ts` — stubs for JSON validation, share code encode/decode
- [ ] `frontend/src/components/ui/__tests__/ThemePicker.test.tsx` — stubs for picker modal, keyboard navigation
- [ ] `frontend/src/lib/__tests__/theme-scheduling.test.ts` — stubs for sunrise/sunset calculation, time range matching

*Existing vitest infrastructure covers the framework requirement.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ripple animation visual quality | THEME-08 | Animation quality is subjective | Switch themes, verify ripple spreads from click point |
| Theme preset artwork display | THEME-02 | Visual rendering in picker | Open Super+Shift+T, verify all 17 presets show artwork + swatches |
| System-follow mode triggers on OS change | THEME-01 | Requires OS dark mode toggle | Change OS appearance, verify app follows |
| Font live preview applies correctly | THEME-04 | Visual font rendering | Select new font in picker, verify app updates live |
| Per-page theme override appearance | THEME-04 | Visual scoping correctness | Set per-page theme, navigate between pages, verify correct theme per page |
| Custom CSS injection hot-reload | THEME-04 | External file change detection | Edit external .css file, verify app reloads changes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 50s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
