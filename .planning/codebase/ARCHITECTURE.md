# Architecture

**Analysis Date:** 2026-03-19

## Pattern Overview

**Overall:** Client-server desktop application (Tauri v2) with embedded Rust backend and React frontend running on the same machine. The architecture follows a **layered BFF (Backend For Frontend)** pattern where the embedded Axum server (`localhost:3000`) proxies requests from the React webview to distributed remote services (Supabase, BlueBubbles, OpenClaw, Mac Bridge) via Tailscale VPN.

**Key Characteristics:**
- **Embedded monolithic backend** — React webview and Axum server (embedded in Tauri binary) run as a single process
- **Local-first** — frontend never directly calls remote APIs; all requests flow through Axum (single trusted gateway)
- **Offline-capable** — SQLite caches data locally; sync engine reconciles with Supabase on 30s intervals
- **Modular integrations** — each remote service (BlueBubbles, OpenClaw, Mac Bridge) is optional and feature-flagged
- **Defense-in-depth auth** — three layers: local API key (`MC_API_KEY`), Tailscale network encryption, Supabase JWT + MFA

## Layers

**Presentation (React/TypeScript):**
- Purpose: User interface and client-side state management
- Location: `frontend/src/`
- Contains: Pages, components, hooks, utilities for queries/mutations/local storage
- Depends on: Axum backend (`localhost:3000`)
- Used by: Tauri webview (browser context running `index.html`)

**Backend Gateway (Rust/Axum):**
- Purpose: HTTP API gateway with auth, validation, caching, and service proxying
- Location: `src-tauri/src/server.rs`, `src-tauri/src/routes/`
- Contains: Axum router, middleware (auth, rate-limiting, request logging), route handlers, service clients
- Depends on: Supabase, BlueBubbles, OpenClaw, Mac Bridge (via HTTP clients)
- Used by: React frontend, external agents (via `MC_AGENT_KEY`)

**Persistence (SQLite + Supabase):**
- Purpose: Local cache (SQLite) and remote source-of-truth (Supabase PostgreSQL)
- Location: `src-tauri/src/sync.rs`, `src-tauri/src/supabase.rs`
- Contains: SQLite connection pool, schema migrations, sync engine, PostgREST client
- Depends on: Local filesystem for SQLite, Tailscale for Supabase connectivity
- Used by: Route handlers, sync engine background task

**System Integration (Secrets, Logging, Validation):**
- Purpose: OS keychain access, structured logging, input sanitization, crypto
- Location: `src-tauri/src/secrets.rs`, `src-tauri/src/logging.rs`, `src-tauri/src/crypto.rs`, `src-tauri/src/validation.rs`
- Contains: Keychain wrappers, rotating file logging, AES-256-GCM encryption, SQL injection prevention
- Depends on: OS APIs (keyring, file system)
- Used by: All route handlers, AppState initialization

## Data Flow

**Authentication Flow (OAuth + MFA):**

1. Frontend: User clicks "Sign in with GitHub" → launches OAuth flow
2. Frontend: `POST /api/auth/start-oauth` with PKCE challenge (SHA256 hash)
3. Backend: Generates PKCE verifier + nonce, stores in `AppState.pending_oauth`, returns auth URL
4. Browser: Redirects to GitHub OAuth consent screen
5. GitHub: Redirects back to `http://127.0.0.1:3000/auth/github/callback?code=...&state=...`
6. Backend: Validates PKCE, exchanges code for JWT token via Supabase GoTrue API
7. Backend: Checks if MFA is enrolled; if yes, requires second factor verification
8. Frontend: User enters TOTP/WebAuthn challenge
9. Backend: Validates challenge via GoTrue, verifies MFA result, stores `UserSession` with `mfa_verified=true`
10. Backend: Loads user secrets from Supabase `user_secrets` table (encrypted with Argon2id key derived from password)
11. Frontend: Session stored in `AppState.session` (JWT tokens, encryption key, expiry); inaccessible to frontend
12. Frontend: Redirect to dashboard; React Query refetches protected data
13. **Auto-refresh:** Background middleware (`inject_session`) refreshes token 2 minutes before expiry

**Data Fetch Flow (Frontend → Backend → Remote):**

1. Frontend: `useQuery(queryKeys.todos)` → `api.get('/api/todos')`
2. Frontend: Sends `X-API-Key: ${MC_API_KEY}` header (loaded from OS keychain at startup)
3. Axum middleware: `auth` middleware validates key; passes `UserSession` to extractor
4. Route handler: `todos_list(RequireAuth(session), State(state))` checks `session.mfa_verified`
5. Handler: `SELECT * FROM todos WHERE user_id = ?` (RLS enforced by Supabase policy)
6. Handler: Returns JSON; React Query caches in memory with 30s staleTime
7. **Offline:** Mutation fails → queued in `offline-queue` via `useOfflineQueue` hook
8. **Reconnect:** Queue drained on window `online` event

**Data Sync Flow (SQLite ↔ Supabase):**

1. **Push** (every 30s): Backend reads `_sync_log` table (local mutations marked `synced_at IS NULL`)
2. **Validation:** Table name, row ID, and payload sanitized to prevent PostgREST injection
3. **Upsert:** POST to `SUPABASE_URL/rest/v1/{table}` with JWT (reads user_id from session)
4. **Success:** Row marked with `synced_at = unixepoch()`
5. **Conflict:** Remote write arrives while row has unsync local changes → logged to `_conflict_log` (local wins)
6. **Pull** (every 30s): Fetches rows updated after local `_max_pulled` timestamp
7. **Merge:** Remote rows inserted/updated into SQLite; RLS policy ensures only user's rows synced
8. **Frontend:** React Query invalidated by `useSyncExternalStore` (not manual event dispatch)

**Remote Service Request Flow (BlueBubbles example):**

1. Frontend: `api.get('/api/messages/chats')`
2. Axum: `messages::router()` matches route, extracts state
3. Handler: `bb_host()` reads `BLUEBUBBLES_HOST` from `AppState.secrets` (env var or user config)
4. Handler: Constructs URL: `{HOST}/api/v1/chats?password={ENCODED_PASSWORD}`
5. Handler: Sends request via `state.http` (shared `reqwest::Client` with timeout)
6. BlueBubbles: Returns `{ "status": 200, "data": [...] }`
7. Handler: Extracts `.data`, caches in SQLite via `state.cache_set(user_id, "chats", json_str)`
8. Frontend: Receives JSON; React Query caches it
9. **Offline:** If BlueBubbles unreachable → return cached value from SQLite (with staleness warning)

## Key Abstractions

**AppState:**
- Purpose: Global application context shared by all request handlers
- Examples: `src-tauri/src/server.rs` lines 161–192
- Pattern: Cloneable struct containing Tauri app handle, DB pool, HTTP client, secrets hashmap, service clients, user session, OAuth state
- Access: Passed via `State(state)` extractor in route handlers; never exposed to frontend

**RequireAuth Extractor:**
- Purpose: Guard routes that require authentication; ensures MFA is verified
- Examples: `src-tauri/src/server.rs` lines 118–159
- Pattern: Custom Axum extractor that pulls `UserSession` from request extensions; returns `401 Unauthorized` or `403 Forbidden (MFA required)`
- Usage: `async fn handler(RequireAuth(session): RequireAuth) { ... }`

**UserSession:**
- Purpose: Immutable authenticated user context (JWT, encryption key, MFA status)
- Examples: `src-tauri/src/server.rs` lines 38–64
- Pattern: Struct that `Debug`-redacts sensitive fields, implements `Drop` with `zeroize` to clear tokens from memory
- Lifetime: Created at login, auto-refreshed by middleware on token expiry, dropped on logout

**Service Client:**
- Purpose: Unified HTTP client with timeout, retry, and health-check logic
- Examples: `src-tauri/src/service_client.rs`
- Pattern: Generic wrapper over `reqwest::Client` for BlueBubbles, OpenClaw, Mac Bridge
- Usage: `state.bb.as_ref()?.get(path)` or `.post(path, body)` with automatic 5xx retry and 30s timeout

**SupabaseClient:**
- Purpose: Lightweight REST client for Supabase PostgREST and RPC endpoints
- Examples: `src-tauri/src/supabase.rs` lines 23–100
- Pattern: Holds URL and service key; encapsulates authentication headers (Bearer + apikey)
- Usage: `SELECT`, `INSERT`, `UPDATE` via PostgREST; used by sync engine and route handlers

**SyncEngine:**
- Purpose: Background task that reconciles local SQLite with remote Supabase
- Examples: `src-tauri/src/sync.rs` lines 40–113
- Pattern: Runs on 30s interval; checks session JWT before each cycle; pushes mutations, pulls remote changes
- Conflict resolution: Local mutations always win (marked in `_conflict_log`); remote update is skipped and will be retried

**React Query:**
- Purpose: Client-side cache for API responses with automatic refetch on focus/reconnect
- Examples: `frontend/src/lib/query-keys.ts`, `frontend/src/main.tsx` lines 39–49
- Pattern: Centralized query keys, 30s staleTime default, 2 retries with exponential backoff
- Integration: Tied to Tauri window focus events for smart refetching

**useSyncExternalStore (State Machines):**
- Purpose: Cross-component reactive state without Redux/Context
- Examples: `lib/sidebar-config.ts`, `lib/keybindings.ts`, `lib/modules.ts`
- Pattern: Module-level listener set + cache; `subscribe(callback)` registers listener; getter reads cache (or computes on demand from localStorage)
- Usage: `useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)` returns frozen snapshot; re-renders only on value change

## Entry Points

**Tauri Main (Rust):**
- Location: `src-tauri/src/main.rs` lines 20–161
- Triggers: Binary startup (`cargo tauri dev` or packaged executable)
- Responsibilities:
  1. Set core dump limits (no sensitive data in coredumps)
  2. Configure logging (stdout + rotating file in `{data_local_dir}/mission-control/logs/`)
  3. Run security checks (debugger detection, LD_PRELOAD, binary integrity)
  4. Load secrets from OS keychain
  5. Initialize SQLite connection pool and run migrations
  6. Start Axum server on `127.0.0.1:3000`
  7. Launch Tauri webview pointing to frontend
  8. Build Tauri app (plugins, window management)

**Frontend Root (TypeScript):**
- Location: `frontend/src/main.tsx` lines 1–191
- Triggers: Webview loads `index.html` → renders React root
- Responsibilities:
  1. Run localStorage migrations (schema version management)
  2. Load saved theme preference, accent color
  3. Fetch `MC_API_KEY` from OS keychain via Tauri IPC
  4. Initialize React Query with default cache config
  5. Tie React Query focus refetching to Tauri window focus events
  6. Render router with lazy-loaded pages
  7. Show loading progress bar while suspense boundaries are pending

**Axum HTTP Server (Rust):**
- Location: `src-tauri/src/server.rs` lines 396+
- Triggers: Called from `main.rs` setup handler; spawned as async task
- Responsibilities:
  1. Initialize `AppState` (DB pool, HTTP client, secrets, service clients)
  2. Apply middleware stack: CORS, auth validation, rate-limiting, request logging
  3. Merge routers from 40+ route modules
  4. Listen on `127.0.0.1:3000`
  5. Start background sync engine (30s intervals)

**Router Nesting:**
- Location: `src-tauri/src/routes/mod.rs` lines 41–80
- Pattern: Top-level router merges all module routers:
  - `/health` → health check
  - `/auth/*` → OAuth, login, MFA verification
  - `/api/messages/*` → BlueBubbles proxy
  - `/api/chat/*` → OpenClaw proxy (WebSocket + SSE)
  - `/api/todos`, `/api/missions`, `/api/ideas` → CRUD endpoints
  - `/{service}/*` → 40 other modules

## Error Handling

**Strategy:** Three layers with type-safe error propagation:

1. **Route Handler** (Rust): Returns `Result<impl IntoResponse, AppError>`
2. **AppError Enum** (`src-tauri/src/error.rs`): Converts to HTTP response with consistent JSON envelope
3. **Frontend** (TypeScript): Catches via `ApiError` wrapper; reports to error reporter

**Patterns:**

**Rust Route Handler:**
```rust
async fn get_todos(RequireAuth(session): RequireAuth, State(state): State<AppState>) -> Result<Json<Value>> {
    let rows = sqlx::query_as::<_, (String, String, bool)>(
        "SELECT id, text, done FROM todos WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;  // ? converts sqlx::Error → AppError → Response

    Ok(Json(json!({ "todos": rows })))
}
```

**AppError Response:**
- `NotFound(String)` → `404 { "ok": false, "error": "...", "code": "not_found" }`
- `Unauthorized` → `401 { "ok": false, "error": "Unauthorized", "code": "unauthorized" }`
- `Forbidden(String)` → `403 { "ok": false, "error": "...", "code": "forbidden" }`
- `BadRequest(String)` → `400 { "ok": false, "error": "...", "code": "bad_request" }`
- `Internal(anyhow::Error)` → `500 { "ok": false, "error": "Something went wrong", "code": "internal_error" }` (details logged)

**Frontend Error Handler:**
```typescript
class ApiError extends Error {
  status: number          // 0 = network, 401 = auth, 404 = not found, etc.
  service: ServiceName    // 'BlueBubbles' | 'OpenClaw' | 'Backend'
  serviceLabel: string    // "BlueBubbles unreachable"
}

// In catch blocks:
} catch (err) {
  if (err instanceof ApiError) {
    showToast(err.serviceLabel)  // User-friendly label per service
    if (err.status === 401) redirect('/login')
    if (err.status === 0) queue for offline replay  // Network error
  }
}
```

## Cross-Cutting Concerns

**Logging:**
- Structured logging via `tracing` crate
- Output: stdout (console) + rotating file in `{data_local_dir}/mission-control/logs/`
- Level: `info` by default (set via `RUST_LOG` env var)
- Redaction: Credentials redacted from log messages (e.g., `redact_bb_url()` hides BlueBubbles passwords)
- Request logging: `tower_http::trace` logs method, path, status, latency; skips paths ending in `.png` (image responses)

**Validation:**
- **SQL Injection Prevention:** All user input goes through parameterized queries (`sqlx::query_as` with `?` placeholders)
- **PostgREST Injection:** Table names validated against allowlist in sync engine; row IDs checked for special chars (`&`, `=`, `()`, etc.)
- **GUID Validation:** Regex patterns in `messages.rs` for chat_guid, message_guid, attachment_guid
- **Frontend Input:** `sanitize_postgrest_value()` in `lib/sanitize.ts` for filter inputs
- **Phone Numbers:** `normalize_phone()` strips formatting, validates length

**Authentication:**
- **OAuth:** PKCE + nonce verification prevents code injection attacks
- **JWT:** Tokens stored server-side only (Rust `AppState.session`); frontend never sees raw JWT
- **MFA:** Hard gate via `RequireAuth` extractor — `mfa_verified` must be true for all data endpoints
- **Session Lifetime:** Hard 24-hour expiry regardless of token refresh; forces periodic re-auth
- **API Key:** `MC_API_KEY` (auto-generated per install, stored in OS keychain) for local process isolation
- **External Agents:** Optional `MC_AGENT_KEY` (user-configured) for agent connections from OpenClaw VM
- **Rate Limiting:** Per-user per-path bucket (not shared); applied at middleware level

**Encryption:**
- **User Secrets:** Supabase `user_secrets` table stores credentials (BlueBubbles password, OpenClaw token) encrypted with AES-256-GCM
- **Key Derivation:** Argon2id from user password + salt (stored in `user_profiles.encryption_salt`)
- **Memory Sanitization:** `zeroize` crate clears tokens from memory on `Drop` (prevents memory dumps)
- **Keychain:** OS keychain stores `MC_API_KEY` and bootstrap secrets (SUPABASE_URL, etc.)

**Tailscale Network Security:**
- **Mutual Authentication:** Every node has WireGuard identity verified by Tailscale coordination server
- **ACL Enforcement:** Only authorized tailnet members can reach services
- **Encrypted Transit:** All traffic is WireGuard-encrypted end-to-end
- **No Port Forwarding:** Services bind to Tailscale IPs only (100.x.x.x CGNAT)
- **Peer Verification:** On startup, `tailscale.rs` validates configured service IPs match expected hostnames via `tailscale status --json`

---

*Architecture analysis: 2026-03-19*
