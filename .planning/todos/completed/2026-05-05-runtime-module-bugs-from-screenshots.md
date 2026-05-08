---
created: 2026-05-05T19:50:00.000-04:00
title: Runtime module bugs from screenshots
area: app-runtime
severity: high
status: completed
completed: 2026-05-07T22:00:00.000-04:00
completed_by_commits:
  - f2977b0
  - 5d5948f
  - 092dbac
  - c4c628c
files:
  - frontend/src/pages/Email.tsx
  - frontend/src/pages/HomeLab.tsx
  - frontend/src/pages/remote/RemotePage.tsx
  - frontend/src/lib/remote-viewer.ts
  - frontend/src/pages/notes/Notes.tsx
  - frontend/src/pages/notes/FileTree.tsx
  - frontend/src/pages/notes/NoteEditor.tsx
  - frontend/src/pages/Memory.tsx
  - src-tauri/src/routes/memory.rs
  - src-tauri/src/routes/workspace.rs
---

## Problem

Live desktop testing on 2026-05-05 exposed multiple broken or incomplete app surfaces. Each screenshot-backed failure below should be treated as its own bug, while Notes and Memory need larger parity sections.

## Screenshot Bugs

### Bug 1: Email page crashes on load

Evidence: Screenshot 2026-05-05 at 7.48.36 PM.

- Route: Email.
- UI state: "This page crashed".
- Error shown: "Importing a module script failed."
- Impact: Email is not loading at all from the desktop package.
- Expected: Email page should load, show account/mailbox state, or show a recoverable ErrorState with retry and diagnostics.

### Bug 2: Home Lab page crashes on load

Evidence: Screenshot 2026-05-05 at 7.48.56 PM.

- Route: Home Lab.
- UI state: "This page crashed".
- Error shown: "Importing a module script failed."
- Impact: Home Lab is not loading at all from the desktop package.
- Expected: Home Lab should load Proxmox/OPNsense status, or show a clear service configuration/offline state.

### Bug 3: Remote Viewer is not reachable

Evidence: Screenshot 2026-05-05 at 7.49.54 PM.

- Route: Remote Viewer.
- UI state: "Embedded viewer is not reachable".
- Error shown: "connect failed: Connection refused (os error 61)".
- Impact: The embedded OpenClaw VM desktop viewer cannot connect.
- Expected: Remote Viewer should connect when the viewer service is running, and when it is down it should show the exact target host/port plus repair actions.

## Notes / Obsidian Backlog Section

The Notes module is missing enough core behavior to track as a full backlog section, not a small polish bug.

### Notes Organization

- Cannot create folders.
- Needs folder rename/delete.
- Needs nested folder support.
- Needs drag-and-drop note and folder moves.
- Needs note move/copy between folders.
- Needs sort modes: name, modified date, created date, and manual order.

### Core Obsidian Parity

- Wikilinks should behave like first-class links across edit and preview.
- Backlinks and outgoing links should be complete and easy to inspect.
- Tags should render and filter reliably.
- Frontmatter/properties should have a structured editor.
- Templates and daily notes should be usable from inside ClawControl.
- Embeds, images, callouts, tables, Mermaid, math, and attachments need full support.
- Graph view should reflect folders, tags, backlinks, and embeds.

### Editor Experience

- Needs Obsidian-style live preview or rich WYSIWYG editing.
- Needs command palette/slash commands for common blocks.
- Needs search, find/replace, and outline/table-of-contents.
- Needs version/revision history surfaced from CouchDB where available.

## Memory / Harness Provider Backlog Section

Memory still needs to be provider-aware instead of assuming one runtime layout.

### Bug 4: Memory page does not show active harness memory files

- Current behavior: Memory may still miss files when the selected harness provider uses a different workspace or memory layout.
- User expectation: Memory should show memory files, soul files, and active runtime memory stores for whichever harness provider the user configured.
- Likely affected backend: `src-tauri/src/routes/memory.rs` must resolve generic harness config and provider-specific aliases instead of relying on one path shape.
- Likely affected workspace route: `src-tauri/src/routes/workspace.rs` must continue using the shared harness path contract for provider-specific workspace discovery.
- Expected: Memory should be provider-aware. Hermes, OpenClaw compatibility, Agent Zero, NanoClaw, and future providers should work through explicit provider discovery or compatibility adapters.

## Triage Notes

Priority order:

1. Fix Email and Home Lab module script crashes because they block entire pages.
2. Fix Remote Viewer target/config diagnostics and service reachability.
3. Update Memory for active harness provider memory/soul sources.
4. Split Notes/Obsidian parity into implementation phases, starting with folder CRUD.

## Acceptance Criteria

- Email route loads without a module script crash in the packaged desktop app.
- Home Lab route loads without a module script crash in the packaged desktop app.
- Remote Viewer shows reachable embedded desktop or a precise target/service repair state.
- Memory lists memory and soul files for the selected harness provider.
- Notes supports folder creation at minimum, with a follow-up phase plan for broader Obsidian parity.

## Completion Notes

- Email now shows explicit AgentMail states instead of crashing or falling back to misleading IMAP copy.
- Home Lab has a module import smoke test and no longer pulls demo state through the chunk path that caused desktop import failures.
- Remote Viewer now resolves local desktop routing correctly and exposes target/repair details.
- Memory now reads local entries from the active harness workspace, including generic memory files and Hermes `.memd`/`SOUL.md` files.
- Notes now supports folder CRUD at the vault layer and folder creation in the UI; broader Obsidian parity remains tracked by the dedicated rich-editor backlog.
