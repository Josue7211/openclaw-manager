---
created: 2026-03-22T17:45:00.000Z
title: OpenClaw Gateway feature parity — features we're missing
area: general
files:
  - frontend/src/pages/chat/
  - frontend/src/pages/agents/
  - frontend/src/pages/crons/
  - frontend/src/pages/Dashboard.tsx
---

## Problem

OpenClaw Gateway (the web UI at openclaw.aparcedo.org) has features that Mission Control doesn't replicate yet. Since MC is supposed to be THE controller for OpenClaw, it needs feature parity + more.

## OpenClaw Gateway Features (from CSS/JS analysis)

### Chat (we have basic, they have more)
- **Chat split container** — side-by-side chat views
- **Focus mode** — distraction-free chat (exit button visible)
- **Chat attachments preview** — file attachment before sending
- **Chat tool cards** — clickable tool usage cards inline
- **Chat message images** — inline image rendering in messages
- **Group messages** — message grouping/threading
- **New messages indicator** — "new messages" banner for scroll-to-bottom
- **Compaction indicator** — shows when context is being compacted (active/complete/fallback states)
- **Search conversation** — search within a chat session
- **Delete message** — remove individual messages
- **Copy code** — code block copy button
- **Message queue** — queued messages while processing

### Agents (we have basic list, they have full management)
- **Agent overview grid** — grid layout showing all agents
- **Agent sidebar** — dedicated agent detail sidebar
- **Agent tabs** — tabbed interface per agent (with count badges)
- **Agent files** — file browser per agent (grid + list views, editor, file meta)
- **Agent tools** — tool management per agent (grid layout, buttons, meta)
- **Agent skills** — skill management with groups and rows
- **Agent model select** — per-agent model configuration with fields
- **Agent actions menu** — dropdown actions per agent
- **Agent avatar** — customizable agent avatars (lg size)
- **Agent chip input** — tag/chip input for agent config
- **Agent KV** — key-value metadata display

### Cron Jobs (we have basic, they have full CRUD)
- **Cron workspace** — dedicated cron management workspace
- **Cron form** — full cron job creation/edit form with grid layout
- **Cron form sections** — organized form sections
- **Cron advanced** — advanced cron options
- **Cron stagger group** — staggered execution groups
- **Cron job detail** — expandable job details (state, payload, footer)
- **Cron job status pills** — ok/error/na/skipped status indicators
- **Cron run history** — run entry list with filters and search
- **Cron submit reason** — reason field when submitting
- **Cron checkbox** — inline toggle options
- **Cron help** — contextual help for cron expressions
- **Cron filter** — dropdown + search filtering

### Config/Settings
- **Config form (modern)** — modern settings form style
- **Config section cards** — card-based settings sections
- **Config section hero** — hero section in settings
- **Config top tabs** — tabbed settings navigation
- **QR code** — QR generation (for mobile pairing?)
- **Toggle raw config redaction** — show/hide sensitive config values

### Dashboard / Usage
- **Dashboard header** — dashboard with header
- **Usage over time** — token usage charts over time
- **Token tracking** — read/write cache token counts, visibility toggle
- **Data table** — full data table component (search, pagination, sort, row actions, badges)
- **Data table badges** — direct/global/group/unknown badge types

### Sessions
- **Session key display** — session key management
- **Session link** — shareable session links
- **Copy session name** — quick copy

### Other
- **Shell** — terminal/shell interface
- **Exec** — command execution
- **Debug** — debug tools
- **Login** — auth with QR
- **Command palette** — cmd+k style command palette
- **Accounts** — multi-account support (card list with status)
- **BlueBubbles/WhatsApp/WebChat** — multi-channel chat integrations
- **Color mode** — theme switching
- **Update banner** — dismissable update notification

## What We're Missing (Priority)

### Critical (core controller features)
1. **Agent management UI** — full CRUD for agents (files, tools, skills, model config, avatar)
2. **Cron job CRUD** — create/edit/delete cron jobs with form, not just read-only list
3. **Chat improvements** — focus mode, attachments, tool cards, search, delete message, compaction indicator
4. **Token usage tracking** — usage over time charts, read/write cache stats
5. **Shell/terminal** — execute commands on OpenClaw VM from MC

### Important (parity)
6. **Data table component** — reusable table with search, pagination, sort, actions
7. **Agent file browser** — view/edit agent workspace files
8. **Session management** — session keys, sharing, linking
9. **Multi-account support** — switch between OpenClaw accounts/instances
10. **Command palette improvements** — match their cmd+k functionality

### Nice-to-have
11. **QR code pairing** — mobile access setup
12. **Update notifications** — banner when new version available
13. **Compaction indicator** — show context window management in chat
14. **Chat split view** — side-by-side conversations

## Solution

These should be a future milestone (v0.0.3 or v0.1.0) focused on "OpenClaw Controller Parity." The agent management and cron CRUD are the highest priority since MC is supposed to be the primary way to manage OpenClaw.
