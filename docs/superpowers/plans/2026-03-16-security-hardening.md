# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Supabase from the frontend, enable RLS on all tables, proxy auth/realtime through Axum, add offline-first SQLite, and harden security across the stack.

**Architecture:** Each user runs a Tauri app with embedded Axum on localhost:3000. Axum connects to a shared Supabase instance behind Cloudflare Tunnel. JWTs are stored in Rust memory (never exposed to frontend). Local SQLite is the primary data store, synced to Supabase when online.

**Tech Stack:** Rust (Axum, sqlx, tokio), TypeScript (React, TanStack Query), PostgreSQL (Supabase), SQLite

**Spec:** `docs/superpowers/specs/2026-03-16-security-hardening-design.md`

---

## Execution Order & Dependencies

```
Phase 1: RLS Migration (database-only, no code changes)
    |
    v
Phase 2: Backend Auth + Session + Supabase Client (Rust)
    |       \
    v        v
Phase 3a: Realtime SSE (Rust)    Phase 3b: Frontend Rewrite (TS)
    |                                |
    +--------------------------------+
    |
    v
Phase 4: Offline-First SQLite + Sync Engine (Rust)
```

Phases 1 and 2 are sequential. Phases 3a and 3b can run in parallel. Phase 4 depends on 2 and 3.

---

## Chunk 1: Phase 1 — RLS Migration

### Task 1.1: Create the updated_at trigger function and user_id migration

**Files:**
- Create: `supabase/migrations/20260316000000_rls_user_isolation.sql`

This is a single large migration that transforms the entire database. It must be tested on a backup first.

- [ ] **Step 1: Write the migration file**

The migration must (in order):
1. Create the `update_updated_at_column()` trigger function
2. For each of the 19 tables:
   a. Add `user_id UUID REFERENCES auth.users ON DELETE CASCADE` (nullable)
   b. Add `updated_at TIMESTAMPTZ DEFAULT now()` if missing
   c. Add `deleted_at TIMESTAMPTZ DEFAULT NULL`
   d. Create `updated_at` trigger
   e. Create `user_id` index
3. Backfill all rows with a placeholder UUID (documented as `-- REPLACE WITH YOUR AUTH USER UUID`)
4. Set `user_id` to NOT NULL on all tables
5. Enable RLS on all tables
6. Create `user isolation` policy on all tables
7. Handle special cases:
   - `user_preferences`: drop old TEXT PK, add UUID user_id, new PK
   - `daily_reviews`: drop unique on `(date)`, add unique on `(user_id, date)`
   - `weekly_reviews`: drop unique on `(week_start)`, add unique on `(user_id, week_start)`
   - `habit_entries`: drop unique on `(habit_id, date)`, add unique on `(user_id, habit_id, date)`
8. Set `REPLICA IDENTITY FULL` on realtime-published tables
9. Create `user_secrets` table with RLS
10. Create `user_usage` table with RLS

- [ ] **Step 2: Review migration for correctness**

Check:
- Every table has `user_id`, `updated_at`, `deleted_at`
- Every table has `ENABLE ROW LEVEL SECURITY`
- Every table has the `user isolation` policy
- Every trigger is created
- Unique constraints are updated to include `user_id`
- `user_preferences` migration handles the TEXT→UUID PK change

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260316000000_rls_user_isolation.sql
git commit -m "feat(db): add user_id + RLS to all 19 tables

Enable Row Level Security with user_id isolation on every table.
Add updated_at + deleted_at columns for sync support.
Create user_secrets (encrypted credentials) and user_usage (budget caps) tables.
Backfill placeholder — must replace UUID before running on production."
```

---

## Chunk 2: Phase 2 — Backend Auth, Session, and Supabase Client

### Task 2.1: Add UserSession to AppState

**Files:**
- Modify: `src-tauri/src/server.rs`

- [ ] **Step 1: Define UserSession struct**

Add to `server.rs`:
```rust
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct UserSession {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: String,
    pub email: String,
    pub expires_at: i64,        // unix timestamp
    pub encryption_key: Vec<u8>, // Argon2id-derived, for user_secrets decryption
}

// Add to AppState:
pub session: Arc<RwLock<Option<UserSession>>>,
pub refresh_mutex: Arc<tokio::sync::Mutex<()>>,
```

- [ ] **Step 2: Initialize session fields in `start()`**

Add `session: Arc::new(RwLock::new(None))` and `refresh_mutex: Arc::new(tokio::sync::Mutex::new(()))` to the AppState constructor.

- [ ] **Step 3: Add session extractor middleware**

New middleware function `extract_session` that:
- Reads `AppState.session`
- If session exists and `expires_at` is within 60 seconds: auto-refresh (acquiring refresh_mutex)
- Injects `UserSession` into request extensions
- Routes that require auth can extract it; auth-exempt routes skip

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/server.rs
git commit -m "feat(auth): add UserSession to AppState with auto-refresh middleware"
```

### Task 2.2: Add `*_as_user` methods to SupabaseClient

**Files:**
- Modify: `src-tauri/src/supabase.rs`

- [ ] **Step 1: Write test for `auth_headers_as_user`**

```rust
#[test]
fn test_as_user_uses_user_jwt() {
    // Verify that as_user methods use the provided JWT, not service key
}
```

- [ ] **Step 2: Add internal `auth_headers_as_user` helper**

```rust
fn auth_headers_as_user(
    &self,
    builder: reqwest::RequestBuilder,
    jwt: &str,
) -> reqwest::RequestBuilder {
    builder
        .header("apikey", &self.service_key) // apikey is always the service key
        .header("Authorization", format!("Bearer {}", jwt)) // but auth is user JWT
}
```

- [ ] **Step 3: Add all `*_as_user` variants**

`select_as_user`, `select_single_as_user`, `insert_as_user`, `upsert_as_user`, `update_as_user`, `delete_as_user` — identical to originals but using `auth_headers_as_user`.

- [ ] **Step 4: Run tests**

```bash
cd src-tauri && cargo test supabase
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/supabase.rs
git commit -m "feat(supabase): add *_as_user methods for JWT passthrough"
```

### Task 2.3: Implement Supabase GoTrue auth client

**Files:**
- Create: `src-tauri/src/gotrue.rs`

This module calls the Supabase GoTrue (Auth) REST API directly, without the Supabase JS SDK.

- [ ] **Step 1: Implement core auth functions**

```rust
pub struct GoTrueClient { http: Client, url: String, service_key: String }

impl GoTrueClient {
    pub async fn sign_in_with_password(email, password) -> Result<AuthResponse>
    pub async fn sign_up(email, password) -> Result<AuthResponse>
    pub async fn refresh_token(refresh_token) -> Result<AuthResponse>
    pub async fn sign_out(access_token) -> Result<()>
    pub async fn exchange_code_for_session(code, code_verifier) -> Result<AuthResponse>
    pub async fn get_user(access_token) -> Result<UserInfo>
    pub async fn update_user(access_token, updates) -> Result<UserInfo>
    pub async fn mfa_enroll(access_token, factor_type, friendly_name) -> Result<MfaEnrollResponse>
    pub async fn mfa_challenge(access_token, factor_id) -> Result<MfaChallengeResponse>
    pub async fn mfa_verify(access_token, factor_id, challenge_id, code) -> Result<AuthResponse>
    pub async fn mfa_unenroll(access_token, factor_id) -> Result<()>
    pub async fn mfa_list_factors(access_token) -> Result<MfaFactorsResponse>
    pub fn generate_pkce() -> (String, String) // (code_verifier, code_challenge)
    pub fn build_oauth_url(provider, redirect_to, code_challenge) -> String
}
```

GoTrue API docs: `POST /auth/v1/token?grant_type=password`, `POST /auth/v1/signup`, `POST /auth/v1/token?grant_type=refresh_token`, `POST /auth/v1/token?grant_type=pkce`, `GET /auth/v1/user`, `PUT /auth/v1/user`, etc.

- [ ] **Step 2: Write unit tests for PKCE generation and URL building**

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/gotrue.rs
git commit -m "feat(auth): implement GoTrue REST client for server-side auth"
```

### Task 2.4: Implement auth route handlers

**Files:**
- Modify: `src-tauri/src/routes/auth.rs`

- [ ] **Step 1: Add login handler**

`POST /api/auth/login` — calls GoTrue `sign_in_with_password`, stores session in AppState, derives encryption key from password via Argon2id.

- [ ] **Step 2: Add signup handler**

`POST /api/auth/signup` — requires invitation token, calls GoTrue `sign_up`, seeds default agents for the new user.

- [ ] **Step 3: Add OAuth handlers**

`GET /api/auth/oauth/:provider` — generates PKCE pair, stores verifier in memory, returns OAuth URL.
`GET /api/auth/callback` — exchanges code using stored verifier, stores session.

- [ ] **Step 4: Add MFA handlers**

`POST /api/auth/mfa/enroll`, `/mfa/challenge`, `/mfa/verify`, `DELETE /api/auth/mfa/unenroll/:id`

- [ ] **Step 5: Add session, refresh, password, logout handlers**

`GET /api/auth/session`, `POST /api/auth/refresh`, `POST /api/auth/password`, `POST /api/auth/logout`

- [ ] **Step 6: Add per-user rate limiting to auth endpoints**

5 req/min per IP for login/signup. Lockout after 5 failures in 15 minutes.

- [ ] **Step 7: Run Rust tests**

```bash
cd src-tauri && cargo test auth
```

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/routes/auth.rs
git commit -m "feat(auth): full auth proxy — login, OAuth PKCE, MFA, session management"
```

### Task 2.5: Migrate all route handlers to use user JWT

**Files:**
- Modify: Every file in `src-tauri/src/routes/` that uses `SupabaseClient`

This is the largest single task. Every route that calls `SupabaseClient::from_state(&state)` must be updated to:
1. Extract `UserSession` from request extensions
2. Use `*_as_user` methods with the session's access token

- [ ] **Step 1: Create a `RequireAuth` extractor**

Axum extractor that reads `UserSession` from extensions, returns 401 if missing.

- [ ] **Step 2: Update routes one module at a time**

For each module (todos, missions, ideas, agents, habits, etc.):
- Add `session: RequireAuth` parameter to each handler
- Replace `sb.select(...)` with `sb.select_as_user(..., &session.access_token)`
- Replace `sb.insert(...)` with `sb.insert_as_user(..., &session.access_token)`
- Same for update, delete, upsert

Modules to update: `todos.rs`, `missions.rs`, `agents.rs`, `ideas.rs`, `captures.rs`, `habits.rs`, `knowledge.rs`, `decisions.rs`, `reviews.rs`, `changelog.rs`, `stale.rs`, `workflow_notes.rs`, `preferences.rs`, `cache.rs`, `pipeline/*.rs`, `status.rs`

- [ ] **Step 3: Add per-user rate limiting middleware**

Replace global atomic counter with per-user `HashMap<String, RateBucket>`. Different limits for reads (120/min), mutations (30/min), AI/chat (10/min).

- [ ] **Step 4: Add response sanitization middleware**

Strip fields named `password`, `secret`, `token`, `key`, `credentials` from JSON responses.

- [ ] **Step 5: Run full Rust test suite**

```bash
cd src-tauri && cargo test
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/routes/
git commit -m "feat(routes): migrate all handlers to user JWT passthrough with per-user rate limiting"
```

### Task 2.6: Implement user_secrets encryption

**Files:**
- Create: `src-tauri/src/crypto.rs`
- Modify: `src-tauri/src/routes/` (add secrets CRUD endpoints)

- [ ] **Step 1: Implement AES-256-GCM encrypt/decrypt with Argon2id key derivation**

```rust
pub fn derive_key(password: &str, salt: &[u8]) -> Vec<u8> // Argon2id
pub fn encrypt(plaintext: &[u8], key: &[u8]) -> (Vec<u8>, Vec<u8>) // (ciphertext, nonce)
pub fn decrypt(ciphertext: &[u8], nonce: &[u8], key: &[u8]) -> Vec<u8>
```

- [ ] **Step 2: Add routes for user_secrets CRUD**

`GET /api/secrets/:service` — fetch + decrypt credentials
`PUT /api/secrets/:service` — encrypt + upsert credentials
`DELETE /api/secrets/:service` — delete credentials

Require re-authentication (password confirmation) for modifications.

- [ ] **Step 3: Update service client initialization**

On login, after deriving encryption key, fetch user's secrets from Supabase and decrypt. Build per-user ServiceClient instances (BlueBubbles, OpenClaw) from decrypted credentials. Store in session.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/crypto.rs src-tauri/src/routes/
git commit -m "feat(secrets): AES-256-GCM encrypted per-user service credentials"
```

---

## Chunk 3a: Phase 3a — Realtime SSE Proxy (Rust)

### Task 3a.1: Implement SSE endpoint

**Files:**
- Create: `src-tauri/src/routes/events.rs`
- Modify: `src-tauri/src/routes/mod.rs`

- [ ] **Step 1: Implement `GET /api/events` SSE endpoint**

Uses the authenticated user's JWT to subscribe to Supabase Realtime (which respects RLS). Forwards matching postgres_changes events as SSE messages.

Uses `axum::response::sse::Sse` with `tokio::sync::broadcast` channel. The Supabase Realtime client connects via WebSocket to `wss://{supabase_url}/realtime/v1/websocket`.

Event format: `data: {"table":"todos","event":"UPDATE","id":"uuid"}\n\n`

Tables: agents, todos, ideas, missions, cache.

- [ ] **Step 2: Add keepalive heartbeat**

Send `:keepalive\n\n` every 15 seconds to prevent connection timeout.

- [ ] **Step 3: Wire into router**

Add `.merge(events::router())` in `mod.rs`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/routes/events.rs src-tauri/src/routes/mod.rs
git commit -m "feat(realtime): SSE proxy for Supabase Realtime with per-user JWT"
```

---

## Chunk 3b: Phase 3b — Frontend Rewrite (TypeScript)

### Task 3b.1: Create useRealtimeSSE hook

**Files:**
- Create: `frontend/src/lib/hooks/useRealtimeSSE.ts`

- [ ] **Step 1: Implement the hook**

Module-level singleton `EventSource` connected to `/api/events`. Components register table interest. On events, invalidate matching React Query keys or call callbacks.

```typescript
const listeners = new Map<string, Set<() => void>>()
let eventSource: EventSource | null = null

export function useRealtimeSSE(tables: string[], options: {
  queryKey?: Record<string, readonly unknown[]>
  onEvent?: (table: string, event: string) => void
})
```

- [ ] **Step 2: Write tests**

Test: listener registration, cleanup on unmount, query invalidation.

- [ ] **Step 3: Commit**

### Task 3b.2: Rewrite AuthGuard and Login

**Files:**
- Modify: `frontend/src/components/AuthGuard.tsx`
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/pages/login/EmailForm.tsx`
- Modify: `frontend/src/pages/login/MfaEnrollView.tsx`
- Modify: `frontend/src/pages/login/MfaVerifyForm.tsx`

- [ ] **Step 1: Rewrite AuthGuard**

Replace `supabase.auth.getSession()` with `api.get('/api/auth/session')`.
Replace `supabase.auth.onAuthStateChange()` with polling `/api/auth/session` every 30s.
Remove all imports from `@/lib/supabase/client`.

- [ ] **Step 2: Rewrite Login page**

Replace `supabase.auth.signInWithPassword()` with `api.post('/api/auth/login')`.
Replace `supabase.auth.signInWithOAuth()` with `api.get('/api/auth/oauth/:provider')` → open returned URL.
Replace `supabase.auth.exchangeCodeForSession()` → removed (backend handles this).
Replace all MFA calls with `/api/auth/mfa/*` endpoints.

- [ ] **Step 3: Rewrite MFA components**

MfaEnrollView: `api.post('/api/auth/mfa/enroll')` instead of `supabase.auth.mfa.enroll()`
MfaVerifyForm: `api.post('/api/auth/mfa/verify')` instead of challenge+verify pattern

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 5: Commit**

### Task 3b.3: Rewrite Settings auth sections

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/pages/settings/SettingsUser.tsx`

- [ ] **Step 1: Replace all Supabase auth calls with API endpoints**

Password change → `api.post('/api/auth/password')`
MFA management → `/api/auth/mfa/*` endpoints
Sign out → `api.post('/api/auth/logout')`

- [ ] **Step 2: Commit**

### Task 3b.4: Replace all useSupabaseRealtime with useRealtimeSSE

**Files:**
- Modify: `frontend/src/pages/Agents.tsx`
- Modify: `frontend/src/pages/Todos.tsx`
- Modify: `frontend/src/pages/Personal.tsx`
- Modify: `frontend/src/pages/pipeline/PipelineIdeas.tsx`
- Modify: `frontend/src/pages/pipeline/PipelineShipLog.tsx`
- Modify: `frontend/src/pages/dashboard/useDashboardData.ts`
- Delete: `frontend/src/lib/hooks/useSupabaseRealtime.ts`

- [ ] **Step 1: Replace imports and calls in each file**

Change `useSupabaseRealtime('channel', 'table', { queryKey })` to `useRealtimeSSE(['table'], { queryKey: { table: queryKey } })`.

- [ ] **Step 2: Delete old hook**

- [ ] **Step 3: Commit**

### Task 3b.5: Remove Supabase SDK from frontend

**Files:**
- Delete: `frontend/src/lib/supabase/client.ts`
- Delete: `frontend/src/lib/offline-queue.ts`
- Modify: `frontend/src/lib/api.ts` — remove 'Supabase' from ServiceName
- Modify: `frontend/src/lib/preferences-sync.ts` — remove Supabase references
- Modify: `frontend/package.json` — remove `@supabase/supabase-js`
- Modify: `frontend/.env.example` — remove VITE_SUPABASE_* vars

- [ ] **Step 1: Remove files and references**

- [ ] **Step 2: Run full test suite**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 3: Run TypeScript type check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(frontend): remove Supabase SDK — all auth/realtime proxied through Axum"
```

---

## Chunk 4: Phase 4 — Offline-First SQLite + Sync Engine

### Task 4.1: Create local SQLite schema for all tables

**Files:**
- Create: `src-tauri/migrations/0003_sync_tables.sql`

- [ ] **Step 1: Write SQLite migration**

Mirror the high-value Supabase tables in SQLite: todos, missions, mission_events, agents, ideas, captures, habits, habit_entries, user_preferences. Plus sync metadata tables (_sync_log, _sync_state, _conflict_log).

Use INTEGER for timestamps (epoch seconds), TEXT for UUIDs.

- [ ] **Step 2: Commit**

### Task 4.2: Implement sync engine

**Files:**
- Create: `src-tauri/src/sync.rs`

- [ ] **Step 1: Implement push (local → Supabase)**

Read `_sync_log` where `synced_at IS NULL`, call Supabase upsert/delete with user JWT.

- [ ] **Step 2: Implement pull (Supabase → local)**

For each synced table, query Supabase for `updated_at > last_synced_at`, upsert into local SQLite.

- [ ] **Step 3: Implement conflict detection and logging**

When pull finds a row that was also modified locally, compare `updated_at`. Log to `_conflict_log`.

- [ ] **Step 4: Implement background sync task**

`tokio::spawn` a loop that runs push+pull every 30 seconds while Supabase is reachable. Run on startup and on reconnect.

- [ ] **Step 5: Commit**

### Task 4.3: Migrate route handlers to read/write local SQLite

**Files:**
- Modify: `src-tauri/src/routes/todos.rs` (and others)

- [ ] **Step 1: Start with todos as the pilot**

Replace `SupabaseClient` calls with `sqlx` queries against local SQLite. Write to `_sync_log` on every mutation.

- [ ] **Step 2: Extend to missions, agents, ideas, habits**

Same pattern. Each mutation writes to SQLite + logs to `_sync_log`.

- [ ] **Step 3: Add Supabase health check endpoint**

`GET /api/health/supabase` — checks if Supabase is reachable. Used by frontend ConnectionStatus.

- [ ] **Step 4: Run full test suite**

```bash
cd src-tauri && cargo test
cd frontend && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(offline): local SQLite as primary store with Supabase sync engine"
```

---

## Post-Implementation Verification

After all phases are complete:

- [ ] **Run full test suite** (`./scripts/pre-commit.sh`)
- [ ] **Manual test: login flow** (email + OAuth + MFA)
- [ ] **Manual test: data isolation** (create user A and B, verify A can't see B's data)
- [ ] **Manual test: offline** (disconnect network, verify reads/writes work, reconnect, verify sync)
- [ ] **Manual test: rate limiting** (exceed limits, verify 429 responses)
- [ ] **Manual test: budget caps** (set limit, exceed it, verify rejection)
- [ ] **Security review** (run security review agent on all changes)
- [ ] **Apply RLS migration to production** (replace placeholder UUID, run `npm run db:push`)
