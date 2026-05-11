# 25-Star Atomic Execution Ledger

This ledger turns the 25-star roadmap into small bricks that can be shipped, verified, and audited one by one. Each brick should be merged only after it has a clear acceptance check.

## Operating Rule

Work in this order unless a production breakage forces a detour:

1. Make the source-of-truth path reliable.
2. Add the contract or schema.
3. Wire one narrow backend path.
4. Wire the UI or remote consumer.
5. Add a real verification path.
6. Mark the brick done only when it works against the source, not just local state.

## Brick Ledger

| Brick | Area | Status | Acceptance |
| --- | --- | --- | --- |
| 001 | Approval Kernel | Done | Shared Agent Shell contract exists. |
| 002 | Approval Kernel | Done | SQLite tables exist for approval requests, capability grants, and approval audit events. |
| 003 | Approval Kernel | Done | Local ClawControl approvals appear in `/api/approvals` beside Harness and Agent Secrets. |
| 004 | Approval Kernel | Done | Agent Shell can report execution result and ClawControl consumes the capability. |
| 005 | Approval Kernel | Done | Expired approvals/grants are swept or marked before use. |
| 006 | Approval Kernel | Done | Approval Center filters by source, risk, and age. |
| 007 | Agent Shell | Done | Agent Shell refuses sensitive execution without valid capability. |
| 008 | Agent Shell | Done | Agent Shell reports result envelope after execution. |
| 009 | Agent Secrets | Done | Secret release binds to approval scope and expiry. |
| 010 | Trust Baseline | Done | Integration health dashboard shows Messages, Calendar, Reminders, Agent Shell, Agent Secrets, and memd. |
| 011 | BlueBubbles | Done | Private API helper health detects disconnect within 30 seconds. |
| 012 | Mac Bridge | Done | Safe restart flow exists for local helper/service. |
| 013 | Calendar | Verify | Create/update/delete round-trip hits Mac Bridge source; phone/iCloud confirmation still required. |
| 014 | Reminders | Verify | Create/update/complete/delete round-trip hits Mac Bridge source; phone/iCloud confirmation still required. |
| 015 | Messages | Verify | Send/receive/typing/read/delete/undo/tapback support must be live-verified against BlueBubbles private API. |
| 016 | Mobile Approval | API Done | Mobile API can list, inspect, approve, deny; native/mobile approval client still required. |
| 017 | iMessage Approval | Done | Structured `APPROVE <code>`/`DENY <code>` works for low/medium risk only. |
| 018 | Personal Graph | Pending | People, events, reminders, messages, notes, approvals, and actions share entity links. |
| 019 | Executive Agents | Pending | Chief-of-staff agent proposes a daily plan with approval-gated side effects. |
| 020 | Week Loop | Pending | Morning/midday/evening loop runs with audit, pause, and recovery controls. |
| N001 | Notes | In Progress | Current v1 editor has clean default canvas, hidden inspector, working basic toolbar, and no doc-mode markdown syntax leaks. |
| N002 | Notes | In Progress | TipTap/ProseMirror `DocumentEditor` exists behind doc mode with markdown as canonical storage. |
| N003 | Notes | In Progress | Markdown fixture suite covers frontmatter, headings, lists, tables, images, wikilinks, callouts, math, footnotes, and code. |
| N004 | Notes | Pending | Toolbar commands are TipTap-native, stateful, contextual, and verified in browser. |
| N005 | Notes | Pending | Obsidian parity passes against a real mixed vault with wikilinks, embeds, tags, properties, backlinks, graph, templates, and saved searches. |
| N006 | Notes | Pending | Rich blocks cover editable tables, vault-backed images, callouts, math, Mermaid, code, and footnotes. |
| N007 | Notes | Pending | CouchDB revisions, conflict detection, restore, and comments are available without silent overwrites. |
| N008 | Notes | Pending | DOCX/PDF/HTML/Markdown/vault ZIP export-import passes fixture and visual checks. |
| N009 | Notes | Pending | AI writing tools offer preview diffs for rewrite, continue, summarize, tag/title, and linked-note citations. |
| N010 | Notes | Pending | Final browser matrix, fixture suite, real-vault round-trip, frontend build, and cargo check pass or document unrelated failures. |

## Current Focus

Finish source verification, phone approval, and executive loop next:

- Apple sync verifier must pass for Calendar and Reminders, then be checked on iPhone.
- BlueBubbles private API matrix must be live-smoked.
- Mobile approval API.
- Structured iMessage approval parser for low/medium risk.
- Personal graph links across Apple-world data and audit.
- Morning/midday/evening execution loop.

## Definition Of 100%

The 25-star version is complete when the user can say "run the week" and ClawControl can safely:

- gather context across Apple, email, notes, tasks, calendar, messages, homelab, and memory;
- propose a plan with citations, risks, and open loops;
- execute low-risk work automatically;
- request scoped approval for medium/high-risk work;
- execute through Agent Shell with short-lived capabilities;
- release secrets only through Agent Secrets scoped policy;
- approve from phone or structured iMessage where allowed;
- sync Apple-world changes back to iCloud and phone;
- explain every action after the fact from audit.
