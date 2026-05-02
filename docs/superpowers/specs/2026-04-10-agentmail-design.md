# AgentMail Multi-Inbox Drafting Design

**Date:** 2026-04-10

**Goal**

Add a multi-inbox email workflow to ClawControl where many existing real-world email accounts are unified into one control plane, Agent can assist with inbox triage and draft replies, AgentMail provides the agent-facing intake and thread model, original providers remain the source of truth for outbound mail, and AgentShell enforces a draft-only safety boundary.

## Problem

The current ClawControl email implementation is IMAP-only and assumes a single mailbox configured through `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASSWORD`. That is insufficient for a setup with many accounts and insufficiently structured for safe agent assistance. A direct provider-by-provider automation model would create brittle provider-specific logic and inconsistent safety controls.

The desired experience is a single mail workspace where all real accounts are visible, all threads preserve their original sender identity, Agent can analyze and draft replies across accounts, and dangerous actions are blocked by policy rather than relying on UI convention.

## Desired Outcome

The user can connect many existing inboxes into one ClawControl workspace. Incoming mail from those accounts is routed into AgentMail for agent processing. ClawControl displays a unified mailbox grouped by real account and thread. Agent can summarize, classify, extract tasks, and draft replies. Humans still send mail from the original provider account. AgentShell explicitly denies autonomous send and other high-risk email actions until a later phase.

## Recommended Architecture

The system should use AgentMail as the intake and agent-work layer, ClawControl as the human-facing control plane, and AgentShell as the action-policy enforcement layer.

The core architecture is:

`real provider inboxes -> provider forwarding into mapped AgentMail inboxes -> ClawControl unified workspace -> Agent analysis and draft generation -> human sends from original provider`

This architecture is preferred over direct IMAP-per-account automation because it gives the agent a consistent inbox/thread/message abstraction, scales better across many accounts, keeps sender identity explicit per thread, and centralizes dangerous-action enforcement inside AgentShell.

## Key Design Decisions

### 1. Existing Inboxes Are the Primary Inputs

The system is designed around the user's existing email accounts, not around newly created standalone agent-only inboxes. Every real account that should participate in the workflow gets a corresponding mapping inside ClawControl.

### 2. AgentMail Is the Agent-Facing Mail Layer

AgentMail is not the final sender of record in phase 1. It is the normalized layer for intake, threads, message visibility, and agent operations. ClawControl should ingest from AgentMail instead of trying to make Agent operate directly against many providers.

### 3. Original Providers Remain the Outbound Source of Truth

Replies and sends must remain associated with the original account. Agent drafts only. A human sends from the original provider mailbox or app. This avoids identity confusion, duplicate sent history, and split account ownership.

### 4. AgentShell Enforces Draft-Only Safety

Draft-only behavior must be enforced in AgentShell policy. It must not be implemented merely as a frontend limitation. If Agent attempts a blocked action, the action should fail at the policy layer.

### 5. Sender Identity Must Always Be Explicit

Every thread and draft must carry a resolved original-account identity. If identity cannot be resolved, drafting is blocked. The UI must make the sender context obvious, for example with a visible "replying as" account badge or equivalent account label.

## System Components

### Mail Account Registry

The Mail Account Registry is the authoritative mapping layer between:

- real provider account
- display label
- provider type
- original address
- mapped AgentMail inbox
- forwarding status
- policy profile
- later send-handoff strategy

This registry is required because the system must preserve original sender identity while using AgentMail as the operational layer.

### Mail Intake Adapter

The Mail Intake Adapter consumes AgentMail inbox, thread, and message data and normalizes it for ClawControl. It should treat AgentMail as the intake source, not as the authoritative sender identity. Incoming items must be bound to a real account through the Mail Account Registry before they become draftable.

### Thread Identity Layer

The Thread Identity Layer guarantees that every thread is tied to exactly one original sender account. This layer is responsible for:

- resolving the original account for each thread
- exposing sender identity to the UI
- preventing ambiguous drafts
- carrying sender identity through Agent analysis and draft output

### Agent Mail Worker

Agent should be allowed to:

- read threads
- summarize conversations
- classify and prioritize mail
- extract tasks and reminders
- propose next actions
- generate draft replies

Agent should not be allowed to:

- send mail
- transmit replies
- forward mail externally
- delete mail
- initiate new outbound contact
- send attachments

These restrictions are phase 1 requirements.

### AgentShell Mail Policy

AgentShell is the enforcement layer for all sensitive actions. The initial policy profile should be:

- allow: read, summarize, classify, draft
- deny: send, reply-send, forward-send, delete, new-recipient contact, attachment-send
- optional later: approval-gated archive, mark-read, labeling, low-risk state changes

Policy should be configurable per account so sensitive mailboxes can remain stricter than low-risk ones.

### ClawControl Mail Workspace

The existing ClawControl Email page is not sufficient in its current IMAP-centric form. The mail workspace needs to become account-aware and agent-aware. At minimum it should support:

- account-aware inbox and thread lists
- per-thread original sender identity
- Agent summaries and suggested actions
- draft queue and review state
- clear handoff to the original provider for final sending
- health or degradation status per account

## Data Flow

### Incoming Flow

1. A real provider inbox receives mail.
2. The provider forwards the incoming message into the mapped AgentMail inbox.
3. AgentMail exposes that message through its inbox and thread model.
4. ClawControl ingests the thread and resolves its real account identity through the Mail Account Registry.
5. Agent can then analyze the thread and produce metadata and draft output.

### Draft Flow

1. A user or Agent opens a thread in ClawControl.
2. Agent creates a suggested reply draft.
3. The draft is stored with explicit original account identity.
4. The draft enters a review queue in ClawControl.
5. The human sends from the original provider account.

### Outbound Flow in Phase 1

There is no autonomous outbound flow in phase 1. The system intentionally stops at draft generation. Any future outbound automation must remain out of scope until AgentShell policy and provider-specific send handoff are revisited.

## Guardrails

### Hard Requirements

- Agent is draft-only in phase 1.
- AgentShell must deny send-related actions.
- Drafting must be blocked if original sender identity is missing.
- High-risk behavior must fail closed, not degrade into permissive behavior.

### Safety Rationale

The user explicitly wants Agent to help with email while preserving original provider identities and using AgentShell guardrails. That means the correct boundary is not "Agent can send if the UI happens to expose a button." The correct boundary is "Agent cannot send because the action is denied by policy."

## Failure Handling

### Forwarding Missing or Broken

If a real account is expected to feed AgentMail but forwarding is not active or is failing, ClawControl should mark the account as degraded rather than silently showing an empty mailbox.

### AgentMail Ingestion Failure

If AgentMail ingestion fails for one mapped inbox, the failure should remain isolated to that account. Other accounts should continue working.

### Identity Resolution Failure

If a thread cannot be mapped back to a real account, Agent may still summarize it but may not generate a sendable draft. The UI should explain why drafting is blocked.

### Policy Denial

If Agent or another subsystem attempts a denied action, the denial should be visible and auditable. The system should not silently ignore those operations.

## Rollout Plan

### Phase 1

- Add Mail Account Registry support for many accounts
- Add AgentMail-backed intake and thread ingestion
- Bind every thread to an original account identity
- Expand the Email workspace into an account-aware draft-review surface
- Enforce draft-only policy through AgentShell

### Phase 2

- Add provider-specific send handoff helpers for faster human sending
- Improve draft review ergonomics
- Add account health and forwarding diagnostics

### Phase 3

- Optionally add approval-gated non-send actions such as archive, mark-read, or labeling, only if the workflow proves safe and useful

## Testing Strategy

### Backend Tests

- account registry mapping behavior
- original sender identity resolution
- per-thread draft eligibility
- AgentShell policy enforcement for blocked email actions
- degraded account states when forwarding or intake is unhealthy

### Frontend Tests

- account-aware thread rendering
- draft queue behavior
- blocked-action states
- correct sender identity display in thread and draft review views

### Integration Tests

- incoming forwarded mail to mapped AgentMail inbox appears under the correct real account
- Agent can create a draft for a mapped thread
- blocked actions remain blocked through AgentShell
- ambiguous identity blocks drafting

## Non-Goals

The following are explicitly out of scope for this phase:

- autonomous sending from AgentMail
- outbound sending from Agent through original provider APIs
- collapsing all real accounts into one sender identity
- provider-specific direct automation for every mailbox as the primary architecture

## Temporary Implementation Reality

The current repository still contains an IMAP-based email route and frontend assumptions around direct mailbox configuration. That path is useful as a baseline and may still be needed for fallback or migration, but it is not the target architecture for this feature. The target architecture is account-aware, AgentMail-backed, and policy-gated through AgentShell.

## Open Implementation Question

The remaining implementation choice is how much provider-specific send handoff should exist in phase 1. The design does not require automatic send handoff for correctness. A manual review-and-send flow from the original provider is acceptable for the initial version as long as drafts stay clearly associated with the original account.

## Summary

ClawControl should evolve from a single-IMAP email view into a multi-account mail workspace where AgentMail handles intake and agent-facing thread operations, original provider accounts remain the sender of record, Agent assists through draft-only workflows, and AgentShell enforces the dangerous-action boundary.
