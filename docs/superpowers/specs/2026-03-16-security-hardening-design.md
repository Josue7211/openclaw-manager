# Security Hardening Design

**Date**: 2026-03-16
**Status**: Approved
**Scope**: Remove Supabase from frontend, enable RLS, auth/realtime proxy, offline-first architecture

## Context

Mission Control is a Tauri v2 desktop app that will be shared with family members. Multiple users will share a single self-hosted Supabase instance, each with their own account and fully private data. The Supabase instance is exposed via Cloudflare Tunnel (with Cloudflare Access for network-level auth). A future mobile version is planned.

### Current state

- Frontend uses `@supabase/supabase-js` directly for auth (login, OAuth, MFA) and Realtime subscriptions
- Supabase anon key and URL are exposed to the frontend via `VITE_SUPABASE_*` env vars
- Zero tables have Row Level Security enabled
- No `user_id` column on any table (single-user model with hardcoded `'default'`)
- Backend uses service role key for all Supabase queries
- No offline capability beyond a basic mutation queue

### Target state

- Frontend has zero knowledge of Supabase (no SDK, no URL, no keys)
- Three-layer auth: Cloudflare Access -> Supabase Auth -> RLS
- All tables have `user_id` + RLS policies enforcing `auth.uid() = user_id`
- Backend uses per-user JWT (not service role key) for all user-scoped queries
- App works fully offline via local SQLite, with Supabase as sync layer

## Architecture

```
+------------------------------+
|  Tauri Desktop / Mobile App  |
|  - Only knows server URL     |
|  - No Supabase SDK           |
|  - Auth via /api/auth/*      |
|  - Realtime via /api/events  |
|  - Session in HTTP-only cookie|
+--------------+---------------+
               | HTTPS
               v
+------------------------------+
|  Cloudflare Tunnel + Access  |
|  - Authorized emails only    |
|  - TLS termination           |
|  - DDoS protection           |
+--------------+---------------+
               |
               v
+------------------------------+
|  Axum Backend (homelab)      |
|  - API key (local process)   |
|  - JWT from HTTP-only cookie |
|  - Forwards user JWT to Supa |
|  - Service role: admin only  |
|  - Local SQLite (primary)    |
|  - Sync engine to Supabase   |
+--------------+---------------+
               | local network
               v
+------------------------------+
|  Supabase (homelab)          |
|  - RLS on all 19 tables      |
|  - user_id isolation          |
|  - user_secrets per user     |
|  - Sync/backup layer          |
|  - Not publicly exposed       |
+------------------------------+
```

## Section 1: Data Ownership Model

Every table gets `user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE` and RLS with `auth.uid() = user_id`.

### Tables requiring user_id + RLS (19 tables)

1. missions
2. mission_events
3. todos
4. agents
5. user_preferences (migrate from TEXT user_id to UUID referencing auth.users)
6. ideas
7. captures
8. knowledge_entries
9. changelog_entries
10. decisions
11. daily_reviews
12. weekly_reviews
13. retrospectives
14. habits
15. habit_entries
16. workflow_notes
17. activity_log
18. pipeline_events
19. cache

### New table: user_secrets

Per-user encrypted service credentials:

```sql
CREATE TABLE user_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  service TEXT NOT NULL,
  credentials JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, service)
);
ALTER TABLE user_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user isolation" ON user_secrets
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Services stored: bluebubbles, openclaw, proxmox, opnsense, plex, sonarr, radarr, email, caldav, ntfy.

### Soft deletes for sync

All tables get `deleted_at TIMESTAMPTZ DEFAULT NULL`. Deleted rows are soft-deleted (set `deleted_at = now()`), synced, then purged after 30 days.

## Section 2: Auth Proxy

All auth flows move from frontend Supabase SDK to Axum endpoints.

### New Axum auth endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/login` | POST | Email/password login, returns HTTP-only cookie with JWT |
| `/api/auth/oauth/:provider` | GET | Initiates OAuth flow (GitHub, Google) |
| `/api/auth/oauth/callback` | GET | OAuth callback, exchanges code, sets cookie |
| `/api/auth/mfa/enroll` | POST | Enrolls TOTP factor, returns QR/secret |
| `/api/auth/mfa/challenge` | POST | Creates MFA challenge |
| `/api/auth/mfa/verify` | POST | Verifies TOTP code, upgrades session |
| `/api/auth/mfa/unenroll/:id` | DELETE | Unenrolls MFA factor |
| `/api/auth/session` | GET | Validates JWT from cookie, returns user info |
| `/api/auth/refresh` | POST | Refreshes access token using refresh token |
| `/api/auth/password` | POST | Changes password |
| `/api/auth/logout` | POST | Clears cookie, calls Supabase signOut |
| `/api/auth/signup` | POST | Creates new account |

### Session management

- Access token + refresh token stored in HTTP-only, Secure, SameSite=Strict cookies
- Frontend never sees raw JWTs
- Axum middleware extracts JWT from cookie on every request
- Token refresh happens server-side (Axum detects expiry, refreshes transparently)
- Cookie attributes: `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800` (7 days for refresh token)

### Frontend auth changes

- AuthGuard.tsx: calls `GET /api/auth/session` instead of `supabase.auth.getSession()`
- Login.tsx: calls `POST /api/auth/login` instead of `supabase.auth.signInWithPassword()`
- MFA flows: call `/api/auth/mfa/*` instead of `supabase.auth.mfa.*`
- Settings password change: calls `POST /api/auth/password`
- Logout: calls `POST /api/auth/logout`

## Section 3: Realtime Proxy via SSE

Replace direct Supabase Realtime subscriptions with a single Axum SSE endpoint.

### Axum SSE endpoint

`GET /api/events` — Server-Sent Events stream, authenticated via cookie JWT.

Axum subscribes to Supabase Realtime using the service role key (admin — needs to see all events), then filters events by the connected user's `user_id` before forwarding.

Event format:
```
data: {"table":"todos","event":"UPDATE","id":"uuid-here"}
```

### Tables proxied (currently subscribed)

- agents
- todos
- ideas
- missions
- cache

### Frontend changes

Replace `useSupabaseRealtime` hook with new `useRealtimeSSE` hook:

```typescript
function useRealtimeSSE(tables: string[], options: {
  queryKey?: Record<string, readonly unknown[]>
  onEvent?: (table: string, event: string) => void
})
```

Single SSE connection shared across all components (via a React context or module-level singleton). Each component registers which tables it cares about.

## Section 4: RLS Migration

Single migration file: `supabase/migrations/YYYYMMDDHHMMSS_rls_user_isolation.sql`

### Pattern per table

```sql
-- 1. Add user_id column (nullable first for backfill)
ALTER TABLE {table} ADD COLUMN user_id UUID REFERENCES auth.users ON DELETE CASCADE;

-- 2. Backfill existing rows with the admin user's auth.users UUID
UPDATE {table} SET user_id = '{ADMIN_USER_UUID}';

-- 3. Make NOT NULL
ALTER TABLE {table} ALTER COLUMN user_id SET NOT NULL;

-- 4. Add index for query performance
CREATE INDEX {table}_user_id_idx ON {table}(user_id);

-- 5. Enable RLS
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

-- 6. Create policy
CREATE POLICY "user isolation" ON {table}
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Add soft-delete column
ALTER TABLE {table} ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
```

### Special cases

- `user_preferences`: migrate `user_id TEXT` to `user_id UUID REFERENCES auth.users`. Drop the `'default'` hardcoded value.
- `mission_events`: gets its own `user_id` (not just inherited from missions FK) so RLS works without joins.
- `daily_reviews`: unique constraint changes from `(date)` to `(user_id, date)`.
- `weekly_reviews`: unique constraint changes from `(week_start)` to `(user_id, week_start)`.
- `habit_entries`: unique constraint changes from `(habit_id, date)` to `(user_id, habit_id, date)`.

## Section 5: Backend Query Changes

### New Supabase client methods

Add `*_as_user` variants that use the user's JWT instead of the service role key:

```rust
impl SupabaseClient {
    // Existing: uses service role key (admin only)
    pub async fn select(&self, table: &str, query: &str) -> Result<Value>;

    // New: uses user's JWT (RLS enforced)
    pub async fn select_as_user(&self, table: &str, query: &str, jwt: &str) -> Result<Value>;
    pub async fn insert_as_user(&self, table: &str, body: &Value, jwt: &str) -> Result<Value>;
    pub async fn update_as_user(&self, table: &str, query: &str, body: &Value, jwt: &str) -> Result<Value>;
    pub async fn delete_as_user(&self, table: &str, query: &str, jwt: &str) -> Result<Value>;
    pub async fn upsert_as_user(&self, table: &str, body: &Value, jwt: &str) -> Result<Value>;
}
```

These use `Authorization: Bearer {user_jwt}` instead of the service role key. RLS enforces user isolation automatically.

### Service role key usage (admin only)

Reserved for:
- Health checks
- Realtime subscription (SSE endpoint needs to see all events for filtering)
- Schema migrations
- Any future admin operations

### Route migration

Every Axum route handler gains a `user_jwt: String` parameter extracted by middleware from the cookie. All `client.select()` calls become `client.select_as_user(..., &user_jwt)`.

### Per-user service credentials

Routes that proxy to external services (BlueBubbles, OpenClaw, etc.) fetch that user's credentials from the `user_secrets` table:

```rust
let creds = client.select_as_user(
    "user_secrets",
    &format!("service=eq.{}", service_name),
    &user_jwt
).await?;
```

This means each family member can have different service connections (or none — Messages only works if they have BlueBubbles configured).

## Section 6: Frontend Cleanup

### Remove

- `@supabase/supabase-js` from `package.json`
- `frontend/src/lib/supabase/client.ts`
- `VITE_SUPABASE_URL` env var
- `VITE_SUPABASE_ANON_KEY` env var
- All imports of `supabase` from `@/lib/supabase/client`

### Replace

| Before | After |
|---|---|
| `supabase.auth.signInWithPassword()` | `api.post('/api/auth/login', { email, password })` |
| `supabase.auth.signInWithOAuth()` | `window.open('/api/auth/oauth/github')` |
| `supabase.auth.getSession()` | `api.get('/api/auth/session')` |
| `supabase.auth.onAuthStateChange()` | Poll `/api/auth/session` or SSE auth events |
| `supabase.auth.mfa.*` | `api.post('/api/auth/mfa/*')` |
| `supabase.auth.updateUser()` | `api.post('/api/auth/password')` |
| `supabase.auth.signOut()` | `api.post('/api/auth/logout')` |
| `useSupabaseRealtime(channel, table)` | `useRealtimeSSE([table])` |

### Files affected

- `components/AuthGuard.tsx` — session check
- `pages/Login.tsx` — login flows
- `pages/login/EmailForm.tsx` — email login
- `pages/login/MfaEnrollView.tsx` — MFA enrollment
- `pages/login/MfaVerifyForm.tsx` — MFA verification
- `pages/Settings.tsx` — auth state, MFA status
- `pages/settings/SettingsUser.tsx` — password change, MFA management
- `pages/Agents.tsx` — realtime subscription
- `pages/Todos.tsx` — realtime subscription
- `pages/Personal.tsx` — realtime subscriptions
- `pages/pipeline/PipelineIdeas.tsx` — realtime subscription
- `pages/pipeline/PipelineShipLog.tsx` — realtime subscription
- `pages/dashboard/useDashboardData.ts` — realtime subscriptions
- `lib/hooks/useSupabaseRealtime.ts` — delete, replace with useRealtimeSSE

## Section 7: Offline-First Architecture

### Design principle

Local SQLite is the source of truth. Supabase is the sync/backup layer.

```
Read path:   Frontend -> Axum -> Local SQLite (always fast, always available)
Write path:  Frontend -> Axum -> Local SQLite -> Sync queue -> Supabase (when online)
Sync path:   Axum background task: pull remote changes, push local changes
```

### Local SQLite schema

Mirror all 19 Supabase tables in local SQLite. Plus sync metadata:

```sql
CREATE TABLE _sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  payload TEXT,           -- JSON of the row data
  synced_at TIMESTAMPTZ,  -- NULL if not yet synced
  created_at TIMESTAMPTZ DEFAULT (datetime('now'))
);

CREATE TABLE _sync_state (
  table_name TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,  -- latest updated_at we've seen from Supabase
  last_pushed_at TIMESTAMPTZ   -- latest local change we've pushed
);
```

### Sync engine (Axum background task)

Runs on app startup, on reconnect, and every 30 seconds while online.

**Push** (local -> Supabase):
1. Query `_sync_log` for rows where `synced_at IS NULL`
2. For each, call Supabase upsert/delete using user JWT
3. On success, set `synced_at = now()`

**Pull** (Supabase -> local):
1. For each table, query Supabase: `SELECT * FROM {table} WHERE updated_at > {last_synced_at}`
2. Upsert into local SQLite
3. Update `_sync_state.last_synced_at`

**Conflict resolution**: Last-write-wins using `updated_at`. If remote `updated_at` > local `updated_at`, remote wins. Otherwise local wins.

**Soft deletes**: Rows with `deleted_at` set are synced (so deletion propagates to other devices), then purged from both local and remote after 30 days.

### What changes in Axum

- All route handlers read/write to local SQLite, not Supabase
- New `sync` module with background sync task
- SQLite connection pool (already using rusqlite for missions/messages cache)
- Existing SQLite caches (missions, messages) get absorbed into the unified local store

### Connection status

- Axum exposes `GET /api/health/supabase` which checks if Supabase is reachable
- Frontend `ConnectionStatus.tsx` already exists and shows online/offline
- When offline, app works normally (reads/writes to local SQLite)
- When back online, sync engine catches up automatically

## Security Summary

### Three-layer auth (defense in depth)

| Layer | What it does | What it catches |
|---|---|---|
| Cloudflare Access | Network gate, authorized emails only | Random internet attackers |
| Supabase Auth + JWT | Application auth, per-user sessions | Unauthorized access within the network |
| RLS (user_id) | Database enforcement, row isolation | Bugs in application code, direct DB access |

### Attack surface reduction

| Before | After |
|---|---|
| Supabase URL in frontend | Only Axum URL known to frontend |
| Anon key in frontend | No Supabase keys in frontend |
| Service role key for all queries | User JWT for queries, service role admin-only |
| No RLS | RLS on all 19 tables + user_secrets |
| Direct Realtime connection | Proxied SSE, filtered per-user |
| Data only on remote server | Data lives locally, synced to Supabase |

### Remaining attack vectors

- Cloudflare sees traffic in cleartext at their edge (accepted trade-off for family usability)
- Local SQLite is unencrypted at rest (can add SQLCipher later if needed)
- Service role key on the Axum server could be extracted by local malware (mitigated by OS keychain)
