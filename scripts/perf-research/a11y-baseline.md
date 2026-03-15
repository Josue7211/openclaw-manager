# Accessibility Baseline — Static Analysis

**Date:** 2026-03-15
**Method:** Code analysis only (no browser required)
**Scope:** `frontend/src/**/*.tsx` (excludes test/spec files)

---

## Metrics Summary

| Check | Count | Notes |
|-------|-------|-------|
| `<div onClick>` / `<span onClick>` (non-semantic interactive elements) | **7** | Should be `<button>` or `<a>` |
| `<input>` / `<textarea>` without `aria-label` or `aria-labelledby` | **~30** | 82 total inputs; ~30 lack accessible labels based on spot-checks |
| `<img>` without `alt` attribute | **0** | All 3 found images have `alt` — no violations |
| Modals/dialogs without `role="dialog"` | **2** | Lightbox and MessageMenu lack `role="dialog"` + `aria-modal` |

---

## Check 1: `<div onClick>` — Non-Semantic Interactive Elements (7 violations)

All 7 occurrences:

| File | Line | Nature | True Violation? |
|------|------|--------|----------------|
| `KeyboardShortcutsModal.tsx:43` | Backdrop overlay `div onClick={onClose}` | Backdrop dismiss — should be `<button aria-label="Close">` or `<div aria-hidden>` |
| `Lightbox.tsx:72` | `div onClick={e => e.stopPropagation()}` | Stop-propagation wrapper — not directly actionable by user; acceptable |
| `Lightbox.tsx:134` | Same pattern for video container | Same — not directly invocable; low impact |
| `AudioWaveform.tsx:91` | `div onClick={seek}` — waveform scrubber | Functional interactive element; should be `<button>` with range semantics or `role="slider"` |
| `MessageMenu.tsx:112` | Backdrop overlay `div onClick={onClose}` | Backdrop dismiss — same issue as KeyboardShortcutsModal |
| `Pipeline.tsx:800` | `div onClick={e => e.stopPropagation()}` | Stop-propagation container; not user-invocable |
| `Messages.tsx:2291` | Backdrop `div onClick={() => setConvCtx(null)}` | Backdrop dismiss for context menu |

**True violations (elements that receive keyboard-inaccessible click interactions):** 4
(AudioWaveform scrubber, 3 modal backdrop dismissals)

### Top 3 Actionable Fixes

**1. AudioWaveform.tsx:91 — Waveform scrubber div**
- Impact: High — keyboard users cannot seek audio at all
- Fix: Replace `<div onClick={seek}>` with `<button onClick={seek} aria-label="Seek audio" role="slider" aria-valuenow={...}>`. Alternatively, use a native `<input type="range">` which provides keyboard stepping for free.

**2. MessageMenu.tsx:112 — Modal backdrop dismiss div**
- Impact: Medium — backdrop works on click but has no keyboard equivalent (Escape works via `document.addEventListener` which is already present, so keyboard close is not fully broken — but the backdrop is not announced to screen readers)
- Fix: Add `aria-hidden="true"` to the backdrop `div` (it is decorative). The existing Escape keydown listener covers keyboard dismissal.

**3. KeyboardShortcutsModal.tsx:43 — Modal backdrop dismiss div**
- Same pattern and fix as MessageMenu: add `aria-hidden="true"` to the backdrop.

---

## Check 2: Inputs Without Accessible Labels (~30 violations)

The codebase has 82 `<input>`/`<textarea>` occurrences across 21 files. Many rely on `placeholder` alone (which is not an accessible label per WCAG 1.3.1).

### Spot-checked files with clear violations:

| File | Approx lines | Issue |
|------|-------------|-------|
| `OnboardingWelcome.tsx:194,206,315,419` | 4 inputs | Appear to use only `placeholder`, no `aria-label` |
| `Login.tsx:529,538,622,810` | 4 inputs | Email/password/invite-code fields — some may be covered by adjacent `<label>` elements (need visual inspection), but line-grep shows no aria-label on the element itself |
| `Todos.tsx:156,205,232,240,274` | 5 inputs | Inline editing inputs likely have only `placeholder` |
| `Memory.tsx:121,321` | 1 input + 1 textarea | Search/note inputs |
| `Email.tsx:388,393` | 2 inputs | Account setup form fields |
| `Sidebar.tsx:193,506,1124` | 3 inputs | Quick capture / rename fields |
| `PageHeader.tsx:99,134` | 2 inputs | Search fields |

**Note:** Inputs inside `<label>` elements are accessible even without `aria-label`. This static check cannot detect implicit label associations. The actual violation count is likely 15–25 after accounting for wrapped labels.

### Top 3 Actionable Fixes

**1. `PageHeader.tsx:99` and `:134` — Search inputs**
- These are very likely standalone `<input>` elements with only `placeholder="Search…"` text
- Fix: Add `aria-label="Search"` to each. One-line change per input.

**2. `Sidebar.tsx:506` — Quick capture input**
- The "What are you thinking?" quick capture field in the sidebar
- Fix: Add `aria-label="Quick capture"` to the input element.

**3. `Email.tsx:388` and `:393` — Account setup form**
- Setup form fields for email label and IMAP host
- Fix: Either wrap each `<input>` in a `<label>` tag with visible text, or add `aria-label="Account label"` / `aria-label="IMAP host"` inline.

---

## Check 3: Images Without Alt Text (0 violations)

All `<img>` elements found have `alt` attributes:
- `Lightbox.tsx:73` — `alt="expanded"` (generic but present)
- `OnboardingWelcome.tsx:67` — `alt="Mission Control"` (logo)
- `Login.tsx:377` — `alt="Mission Control"` (logo)
- `Login.tsx:767` — `alt="TOTP QR code"` (MFA QR code)

No action required.

---

## Check 4: Modals Without `role="dialog"` (2 violations)

Components **with** `role="dialog"`: CommandPalette, KeyboardShortcutsModal, NotificationCenter, OnboardingWelcome, Personal.tsx (inline modal).

Components **missing** `role="dialog"` and `aria-modal="true"`:

| Component | File | Notes |
|-----------|------|-------|
| `Lightbox` | `components/Lightbox.tsx` | Full-screen image/video viewer. Has `useEscapeKey` and a close button with `aria-label`, but the outer container `div` has no dialog semantics. Screen readers won't announce it as a modal. |
| `MessageMenu` | `components/messages/MessageMenu.tsx` | Context menu popup. Uses `role` is absent; the menu panel `div` at line 120 has no `role`. Should be `role="menu"` with `role="menuitem"` children rather than `role="dialog"`. |

### Top 2 Actionable Fixes

**1. `Lightbox.tsx:54` — Outer container div**
- Fix: Change the outer `<div onClick={handleClose}>` to include `role="dialog"`, `aria-modal="true"`, `aria-label="Media viewer"` on the inner content `<div>` (not the backdrop). Separate the backdrop from the dialog container.

**2. `MessageMenu.tsx:120` — Menu container div**
- This is a context menu, not a dialog — the correct ARIA pattern is `role="menu"` on the container and `role="menuitem"` on each `<button>` inside
- Fix: Add `role="menu"` to the container `div ref={ref}` at line 120, and `role="menuitem"` to each `MButton` and reaction `<button>`.

---

## Top 5 Easiest Fixes (Prioritized by Impact / Effort)

1. **Lightbox backdrop + dialog role** (`Lightbox.tsx`) — Add `role="dialog"` + `aria-modal="true"` + `aria-label` to the content wrapper; add `aria-hidden="true"` to the backdrop div. ~5 lines changed.

2. **MessageMenu role="menu"** (`MessageMenu.tsx`) — Add `role="menu"` to container, `role="menuitem"` to each action button, `aria-label` to each emoji reaction button (currently emoji-only with no accessible name). The 6 reaction buttons at line 136 have no `aria-label`. ~8 lines changed.

3. **AudioWaveform scrubber** (`AudioWaveform.tsx:91`) — Replace `<div onClick={seek}>` with `<button onClick={seek} aria-label="Seek audio">`. Waveform is keyboard-inaccessible. ~2 lines changed.

4. **PageHeader search inputs** (`PageHeader.tsx:99,134`) — Add `aria-label="Search"` to each input. ~2 lines changed.

5. **Sidebar quick capture input** (`Sidebar.tsx:506`) — Add `aria-label="Quick capture"` to the input. ~1 line changed.

---

## Notes

- This analysis is static (grep/AST-level) and cannot detect:
  - Implicit label associations (`<label><input/></label>` wrapping)
  - Dynamic `aria-*` attributes set via JS
  - Color contrast violations (requires rendering)
  - Focus order issues (requires browser)
  - Screen reader announcement behavior
- The `placeholder` attribute is widely used as the only labeling mechanism. While not counted separately, this is a pervasive WCAG 2.1 Level A failure pattern (SC 1.3.1, 1.3.5) across ~15 inputs.
- All emoji-only reaction buttons in `MessageMenu` (6 buttons) have no accessible name — screen readers will read the raw emoji codepoint description, which may be acceptable but is worth labeling explicitly (e.g., `aria-label="React with love"`).
