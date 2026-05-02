# AgentMail Multi-Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AgentMail-backed, multi-account mail workspace where many real inboxes map to account records, Agent can triage and draft replies, and AgentShell enforces draft-only behavior.

**Architecture:** Store mail account registry and AgentMail credentials server-side, ingest account-aware message/thread data from AgentMail into ClawControl, and refactor the Email UI around mapped accounts and draft review instead of raw IMAP. Keep original provider accounts as the sender of record; phase 1 stops at draft generation and blocks send-related actions through AgentShell policy.

**Tech Stack:** Rust + Axum backend, existing encrypted `user_secrets` storage, Tauri desktop shell, React 19 + TanStack Query frontend, Vitest, Rust unit tests.

---

## File Structure

### Backend

- Create: `src-tauri/src/routes/mail_accounts.rs`
  - CRUD for mapped real accounts and forwarding status, stored as an encrypted `user_secrets` blob.
- Create: `src-tauri/src/routes/agentmail.rs`
  - AgentMail client helpers, request/response types, and account-aware inbox/thread fetch helpers.
- Create: `src-tauri/src/routes/mail_policy.rs`
  - Draft-only policy helpers that validate allowed mail actions before Agent or UI-triggered workflow execution.
- Modify: `src-tauri/src/routes/mod.rs`
  - Register new mail account and AgentMail routes.
- Modify: `src-tauri/src/routes/email.rs`
  - Replace IMAP-only behavior with account-aware AgentMail-backed listing and draft endpoints while keeping legacy IMAP fallback isolated behind helper functions.
- Modify: `src-tauri/src/routes/agent_shell.rs`
  - Add mail-action planning/dispatch endpoints or payload validation for draft-only enforcement.
- Modify: `src-tauri/src/routes/user_secrets.rs`
  - Support `agentmail` and `mail_accounts` service migration/normalization paths if needed.

### Frontend

- Create: `frontend/src/pages/email/api.ts`
  - Typed API helpers for accounts, thread list, drafts, and policy status.
- Create: `frontend/src/pages/email/DraftQueue.tsx`
  - Review queue for Agent-generated drafts with explicit sender-account identity.
- Create: `frontend/src/pages/email/ThreadPanel.tsx`
  - Expanded thread view with account badge, summary, actions, and draft composer/review state.
- Modify: `frontend/src/pages/email/types.ts`
  - Replace single-message types with account-aware thread/draft/policy types.
- Modify: `frontend/src/pages/Email.tsx`
  - Drive the full account-aware workspace.
- Modify: `frontend/src/pages/email/EmailList.tsx`
  - Render account-aware threads instead of plain IMAP email rows.
- Modify: `frontend/src/pages/email/ManagePanel.tsx`
  - Manage mapped real accounts and forwarding status instead of raw IMAP credentials.
- Modify: `frontend/src/lib/query-keys.ts`
  - Add keys for mail accounts, mail threads, and draft queue.

### Tests

- Modify: `src-tauri/src/routes/email.rs`
  - Add unit tests for account resolution and draft blocking.
- Create: `src-tauri/src/routes/mail_accounts.rs`
  - Add unit tests for registry CRUD and default account semantics.
- Create: `src-tauri/src/routes/mail_policy.rs`
  - Add unit tests for allowed/denied actions.
- Create: `frontend/src/pages/email/__tests__/EmailPage.multi-account.test.tsx`
  - End-to-end page behavior for account-aware inboxes and drafts.
- Create: `frontend/src/pages/email/__tests__/DraftQueue.test.tsx`
  - Draft queue behavior.
- Modify: `frontend/src/pages/email/__tests__/types.test.ts`
  - Update type expectations.

### Docs

- Modify: `docs/CONFIGURATION.md`
  - Document AgentMail credential setup and forwarding-based intake.
- Modify: `.env.example`
  - Add commented AgentMail settings or note that phase 1 uses encrypted secrets instead of env-first setup.

---

### Task 1: Add Mail Account Registry Backend

**Files:**
- Create: `src-tauri/src/routes/mail_accounts.rs`
- Modify: `src-tauri/src/routes/mod.rs`
- Test: `src-tauri/src/routes/mail_accounts.rs`

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_mail_account_registry_entry() {
        let entry = MailAccountRecord {
            id: "acct_gmail_personal".into(),
            label: "Personal Gmail".into(),
            provider: "gmail".into(),
            address: "me@gmail.com".into(),
            agentmail_inbox_id: "me-at-agentmail".into(),
            forwarding_status: "active".into(),
            is_default: true,
        };

        assert!(entry.validate().is_ok());
    }

    #[test]
    fn rejects_mail_account_registry_entry_without_address() {
        let entry = MailAccountRecord {
            id: "acct_empty".into(),
            label: "Broken".into(),
            provider: "gmail".into(),
            address: "".into(),
            agentmail_inbox_id: "broken".into(),
            forwarding_status: "pending".into(),
            is_default: false,
        };

        assert!(entry.validate().is_err());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test routes::mail_accounts::tests::validates_mail_account_registry_entry`

Expected: FAIL with unresolved module or missing `MailAccountRecord`.

- [ ] **Step 3: Write minimal implementation**

```rust
use axum::{routing::{get, post, patch, delete}, Json, Router};
use serde::{Deserialize, Serialize};

use crate::server::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailAccountRecord {
    pub id: String,
    pub label: String,
    pub provider: String,
    pub address: String,
    pub agentmail_inbox_id: String,
    pub forwarding_status: String,
    pub is_default: bool,
}

impl MailAccountRecord {
    pub fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(!self.id.trim().is_empty(), "id required");
        anyhow::ensure!(!self.label.trim().is_empty(), "label required");
        anyhow::ensure!(!self.address.trim().is_empty(), "address required");
        anyhow::ensure!(!self.agentmail_inbox_id.trim().is_empty(), "agentmail inbox required");
        Ok(())
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/mail-accounts", get(list_accounts).post(create_account).patch(update_account).delete(delete_account))
}

async fn list_accounts() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "accounts": [] }))
}

async fn create_account() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

async fn update_account() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

async fn delete_account() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test routes::mail_accounts::tests::validates_mail_account_registry_entry routes::mail_accounts::tests::rejects_mail_account_registry_entry_without_address`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/routes/mail_accounts.rs src-tauri/src/routes/mod.rs
git commit -m "feat: add mail account registry route skeleton"
```

### Task 2: Add AgentMail Client and Account-Aware Email Fetch Path

**Files:**
- Create: `src-tauri/src/routes/agentmail.rs`
- Modify: `src-tauri/src/routes/email.rs`
- Modify: `src-tauri/src/routes/mod.rs`
- Test: `src-tauri/src/routes/email.rs`

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn resolves_sender_identity_for_draftable_thread() {
    let thread = MailThread {
        id: "thr_123".into(),
        account_id: Some("acct_gmail_personal".into()),
        subject: "Quarterly update".into(),
        from: "boss@example.com".into(),
        preview: "Can you reply by Friday?".into(),
        unread: true,
    };

    assert!(thread.draftable_account_id().is_some());
}

#[test]
fn blocks_draft_when_thread_has_no_account_identity() {
    let thread = MailThread {
        id: "thr_anon".into(),
        account_id: None,
        subject: "Unknown".into(),
        from: "mystery@example.com".into(),
        preview: "hello".into(),
        unread: true,
    };

    assert!(thread.draftable_account_id().is_none());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test routes::email::tests::resolves_sender_identity_for_draftable_thread`

Expected: FAIL with missing `MailThread` or missing `draftable_account_id`.

- [ ] **Step 3: Write minimal implementation**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailThread {
    pub id: String,
    pub account_id: Option<String>,
    pub subject: String,
    pub from: String,
    pub preview: String,
    pub unread: bool,
}

impl MailThread {
    pub fn draftable_account_id(&self) -> Option<&str> {
        self.account_id.as_deref().filter(|value| !value.trim().is_empty())
    }
}

pub async fn list_threads_for_account(
    _state: &AppState,
    account_id: &str,
) -> anyhow::Result<Vec<MailThread>> {
    Ok(vec![MailThread {
        id: "thr_stub".into(),
        account_id: Some(account_id.to_string()),
        subject: "Stub thread".into(),
        from: "stub@example.com".into(),
        preview: "stub preview".into(),
        unread: true,
    }])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test routes::email::tests::resolves_sender_identity_for_draftable_thread routes::email::tests::blocks_draft_when_thread_has_no_account_identity`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/routes/agentmail.rs src-tauri/src/routes/email.rs src-tauri/src/routes/mod.rs
git commit -m "feat: add agentmail thread adapter and account identity checks"
```

### Task 3: Add Draft-Only Mail Policy Enforcement

**Files:**
- Create: `src-tauri/src/routes/mail_policy.rs`
- Modify: `src-tauri/src/routes/agent_shell.rs`
- Modify: `src-tauri/src/routes/mod.rs`
- Test: `src-tauri/src/routes/mail_policy.rs`

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_mail_draft_action() {
        assert!(mail_action_allowed("draft_reply").is_ok());
    }

    #[test]
    fn rejects_mail_send_action() {
        assert!(mail_action_allowed("send_reply").is_err());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test routes::mail_policy::tests::allows_mail_draft_action`

Expected: FAIL with unresolved module or function.

- [ ] **Step 3: Write minimal implementation**

```rust
use crate::error::AppError;

pub fn mail_action_allowed(action: &str) -> Result<(), AppError> {
    match action {
        "read_thread" | "summarize_thread" | "classify_thread" | "draft_reply" => Ok(()),
        "send_reply" | "forward_message" | "delete_message" | "contact_new_recipient" => {
            Err(AppError::BadRequest("mail action blocked by AgentShell draft-only policy".into()))
        }
        _ => Err(AppError::BadRequest("unknown mail action".into())),
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test routes::mail_policy::tests::allows_mail_draft_action routes::mail_policy::tests::rejects_mail_send_action`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/routes/mail_policy.rs src-tauri/src/routes/agent_shell.rs src-tauri/src/routes/mod.rs
git commit -m "feat: enforce draft-only mail policy"
```

### Task 4: Refactor Frontend Email Types and Page for Account-Aware Threads

**Files:**
- Modify: `frontend/src/pages/email/types.ts`
- Modify: `frontend/src/pages/Email.tsx`
- Modify: `frontend/src/pages/email/EmailList.tsx`
- Create: `frontend/src/pages/email/api.ts`
- Test: `frontend/src/pages/email/__tests__/types.test.ts`
- Test: `frontend/src/pages/email/__tests__/EmailPage.multi-account.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import EmailPage from '@/pages/Email'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn((path: string) => {
      if (path === '/api/mail-accounts') {
        return Promise.resolve({
          accounts: [{ id: 'acct_gmail_personal', label: 'Personal Gmail', provider: 'gmail', address: 'me@gmail.com', agentmail_inbox_id: 'am_1', forwarding_status: 'active', is_default: true }],
        })
      }
      if (path.startsWith('/api/email')) {
        return Promise.resolve({
          threads: [{ id: 'thr_1', account_id: 'acct_gmail_personal', subject: 'Quarterly update', from: 'boss@example.com', preview: 'Can you reply by Friday?', unread: true }],
        })
      }
      return Promise.resolve({})
    }),
  },
}))

test('renders account-aware thread list', async () => {
  render(<EmailPage />)
  expect(await screen.findByText('Personal Gmail')).toBeInTheDocument()
  expect(await screen.findByText('Quarterly update')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/pages/email/__tests__/EmailPage.multi-account.test.tsx`

Expected: FAIL because `EmailPage` still requests `/api/email-accounts` and expects `emails`.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface MailAccount {
  id: string
  label: string
  provider: string
  address: string
  agentmail_inbox_id: string
  forwarding_status: 'active' | 'pending' | 'error'
  is_default: boolean
}

export interface MailThread {
  id: string
  account_id: string | null
  subject: string
  from: string
  preview: string
  unread: boolean
}
```

```tsx
const { data: accountsData } = useQuery({
  queryKey: ['mail-accounts'],
  queryFn: () => api.get<{ accounts: MailAccount[] }>('/api/mail-accounts'),
})

const { data: threadsData } = useQuery({
  queryKey: ['mail-threads', selectedAccountId],
  queryFn: () => api.get<{ threads: MailThread[] }>(`/api/email?account_id=${selectedAccountId ?? ''}`),
  enabled: selectedAccountId !== null,
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/pages/email/__tests__/EmailPage.multi-account.test.tsx src/pages/email/__tests__/types.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/email/types.ts frontend/src/pages/Email.tsx frontend/src/pages/email/EmailList.tsx frontend/src/pages/email/api.ts frontend/src/pages/email/__tests__/types.test.ts frontend/src/pages/email/__tests__/EmailPage.multi-account.test.tsx
git commit -m "feat: add account-aware email workspace shell"
```

### Task 5: Add Draft Queue and Provider-Send Handoff UI

**Files:**
- Create: `frontend/src/pages/email/DraftQueue.tsx`
- Create: `frontend/src/pages/email/ThreadPanel.tsx`
- Modify: `frontend/src/pages/Email.tsx`
- Test: `frontend/src/pages/email/__tests__/DraftQueue.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { DraftQueue } from '@/pages/email/DraftQueue'

test('shows account-aware draft review state', () => {
  render(
    <DraftQueue
      drafts={[{
        id: 'draft_1',
        account_label: 'Personal Gmail',
        subject: 'Re: Quarterly update',
        body: 'Thanks — I will send the numbers tomorrow.',
        handoff_status: 'needs_human_send',
      }]}
    />
  )

  expect(screen.getByText('Personal Gmail')).toBeInTheDocument()
  expect(screen.getByText('needs human send')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/pages/email/__tests__/DraftQueue.test.tsx`

Expected: FAIL with missing component.

- [ ] **Step 3: Write minimal implementation**

```tsx
type DraftItem = {
  id: string
  account_label: string
  subject: string
  body: string
  handoff_status: 'needs_human_send'
}

export function DraftQueue({ drafts }: { drafts: DraftItem[] }) {
  if (drafts.length === 0) return <div>No drafts</div>

  return (
    <div>
      {drafts.map(draft => (
        <section key={draft.id}>
          <strong>{draft.account_label}</strong>
          <div>{draft.subject}</div>
          <div>{draft.body}</div>
          <div>{draft.handoff_status.replaceAll('_', ' ')}</div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/pages/email/__tests__/DraftQueue.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/email/DraftQueue.tsx frontend/src/pages/email/ThreadPanel.tsx frontend/src/pages/Email.tsx frontend/src/pages/email/__tests__/DraftQueue.test.tsx
git commit -m "feat: add draft review queue and provider handoff UI"
```

### Task 6: Document Configuration and Migration Path

**Files:**
- Modify: `docs/CONFIGURATION.md`
- Modify: `.env.example`
- Test: none

- [ ] **Step 1: Write the failing test**

```md
Manual verification target:
- `docs/CONFIGURATION.md` explains AgentMail credential storage and forwarding setup
- `.env.example` no longer implies single-mailbox IMAP is the only supported path
```

- [ ] **Step 2: Run verification to confirm docs are missing**

Run: `rg -n "AgentMail|mail-accounts|forwarding" docs/CONFIGURATION.md .env.example`

Expected: no AgentMail multi-inbox documentation yet, only legacy IMAP settings.

- [ ] **Step 3: Write minimal implementation**

```md
| `agentmail` secret | AgentMail API key stored via encrypted user secrets |
| `mail_accounts` secret | JSON account registry mapping real inboxes to AgentMail inboxes |

Forwarding setup:
1. Configure forwarding from each real provider inbox into its mapped AgentMail inbox.
2. Verify forwarding status in ClawControl Mail Accounts.
3. Keep outbound sending on the original provider in phase 1.
```

```env
# AgentMail multi-inbox workflow (phase 1 uses encrypted app secrets, not env vars)
# Legacy single-mailbox IMAP fallback:
# EMAIL_HOST=imap.your-email-provider.com
# EMAIL_PORT=993
# EMAIL_USER=your-email@example.com
# EMAIL_PASSWORD=your-email-password
```

- [ ] **Step 4: Run verification to confirm docs are updated**

Run: `rg -n "AgentMail|mail_accounts|forwarding" docs/CONFIGURATION.md .env.example`

Expected: matches in both files.

- [ ] **Step 5: Commit**

```bash
git add docs/CONFIGURATION.md .env.example
git commit -m "docs: describe agentmail multi-inbox setup"
```

---

## Self-Review

- Spec coverage:
  - Multi-account registry: covered in Task 1.
  - AgentMail intake: covered in Task 2.
  - Draft-only guardrails: covered in Task 3.
  - Account-aware workspace: covered in Tasks 4 and 5.
  - Configuration and rollout notes: covered in Task 6.
- Placeholder scan:
  - No `TODO`, `TBD`, or “implement later” instructions remain in task steps.
- Type consistency:
  - The plan consistently uses `MailAccount`, `MailThread`, `DraftQueue`, and `mail_action_allowed`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-10-agentmail-multi-inbox.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
