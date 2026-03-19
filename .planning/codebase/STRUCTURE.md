# Codebase Structure

**Analysis Date:** 2026-03-19

## Directory Layout

```
mission-control/
├── frontend/                    # React + Vite SPA (TypeScript)
│   ├── src/
│   │   ├── main.tsx            # Entry point: React root, router, theme loader
│   │   ├── App.tsx             # (Not used — router is in main.tsx)
│   │   ├── globals.css         # CSS variables, keyframes, utilities
│   │   ├── components/         # Reusable UI components
│   │   ├── hooks/              # Custom React hooks (messages, notes, general)
│   │   ├── lib/                # Utilities: API client, query keys, state machines
│   │   ├── pages/              # Route pages (lazy-loaded)
│   │   └── assets/             # Icons, images, logos
│   ├── package.json            # Scripts: dev, build, test, e2e
│   ├── vite.config.ts          # Build config
│   ├── vitest.config.ts        # Test runner config
│   └── tsconfig.json           # TypeScript config
├── src-tauri/                  # Rust backend (Tauri + Axum)
│   ├── src/
│   │   ├── main.rs             # Entry point: logging, security checks, Tauri setup
│   │   ├── server.rs           # Axum: AppState, middleware, request lifecycle
│   │   ├── routes/             # 40+ API endpoint modules
│   │   ├── supabase.rs         # Supabase PostgREST client
│   │   ├── sync.rs             # Background sync engine (SQLite ↔ Supabase)
│   │   ├── secrets.rs          # OS keychain integration
│   │   ├── crypto.rs           # AES-256-GCM encryption + Argon2id KDF
│   │   ├── error.rs            # AppError enum + JSON responses
│   │   ├── logging.rs          # Structured logging setup
│   │   ├── validation.rs       # Input sanitization helpers
│   │   ├── audit.rs            # Append-only security event log
│   │   ├── tailscale.rs        # Peer IP verification
│   │   ├── redact.rs           # Credential redaction for logs
│   │   ├── service_client.rs   # Unified HTTP client wrapper
│   │   ├── gotrue.rs           # Supabase auth client helpers
│   │   ├── commands.rs         # Tauri IPC command handlers
│   │   ├── db.rs               # SQLite pool initialization
│   │   └── tests/              # Unit tests
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri app config (window, plugins, capabilities)
│   └── migrations/             # Local SQLite migrations (0001-0008)
├── supabase/                   # Remote database config
│   ├── migrations/             # PostgreSQL migrations (8 files)
│   ├── config.toml             # Supabase CLI config
│   └── docker-compose.example.yml
├── docs/                       # Documentation
│   ├── CONFIGURATION.md        # Setup guide
│   ├── SECURITY.md             # Full threat model + security architecture
│   ├── api-reference.md        # API endpoint documentation
│   ├── ntfy-setup.md           # Notification setup
│   ├── openclaw-api-setup.md   # OpenClaw integration guide
│   └── testing-checklist.md
├── scripts/                    # Development scripts
│   ├── e2e.sh                  # Playwright E2E test runner
│   └── pre-commit.sh           # Run all tests before commit
├── .planning/codebase/         # GSD codebase analysis documents
│   ├── ARCHITECTURE.md         # This file
│   ├── STRUCTURE.md            # (generated)
│   ├── STACK.md                # (generated)
│   ├── INTEGRATIONS.md         # (generated)
│   ├── CONVENTIONS.md          # (generated)
│   ├── TESTING.md              # (generated)
│   └── CONCERNS.md             # (generated)
├── .github/workflows/          # GitHub Actions CI
│   └── ci.yml                  # Cross-platform builds (Linux, macOS, Windows)
├── CLAUDE.md                   # Project instructions (critical)
├── CHANGELOG.md                # Version history
├── README.md                   # Quick start guide
├── package.json                # Root scripts (db:*, tauri commands)
├── tsconfig.json               # Root TypeScript settings
└── .gitignore                  # Excludes: .env*, *.log, target/, node_modules/
```

## Directory Purposes

**frontend/src/components/:**
- Purpose: Reusable UI components across all pages
- Key files:
  - `LayoutShell.tsx` — Main app shell with sidebar, title bar, command palette, keybinding handler
  - `Sidebar.tsx` — Collapsible sidebar with typewriter animation, quick capture, notification bell
  - `GlobalSearch.tsx` — Spotlight search modal (ARIA combobox)
  - `CommandPalette.tsx` — Cmd+K command menu (lazy-loaded)
  - `messages/` — Message UI components (ContactAvatar, MessageMenu, LinkPreviewCard, ReactionPills)
  - `NotificationCenter.tsx` — In-app notification bell + dropdown
  - `AuthGuard.tsx` — Route protection wrapper
  - `Lightbox.tsx` — Image/video viewer with zoom
  - `OnboardingWelcome.tsx` — Multi-step setup wizard (lazy-loaded, feature-flagged)
  - `PageErrorBoundary.tsx` — Error fallback for route pages
  - `SecondsAgo.tsx` — Live-updating relative timestamps

**frontend/src/hooks/:**
- Purpose: Custom React hooks for data fetching and local state
- Key files:
  - `messages/useMessagesSSE.ts` — SSE subscription to BlueBubbles updates
  - `messages/useConversationList.ts` — Paginated conversation list with caching
  - `messages/useMessageCompose.ts` — Message composition state (draft, attachments, reactions)
  - `notes/useVault.ts` — Obsidian note fetching/caching via backend proxy
  - `useEscapeKey.ts` — Close modals on Escape press
  - `useLocalStorageState.ts` — useState + localStorage persistence
  - `useFocusTrap.ts` — Keyboard focus management for modals
  - `useOfflineQueue.ts` — Queue failed mutations, replay on reconnect
  - `useApiError.ts` — Unified error handling from API responses

**frontend/src/lib/:**
- Purpose: Utility modules for API, state, and data management
- Key files:
  - `api.ts` — Fetch wrapper: 30s timeout, API key auth, offline queue integration
  - `query-keys.ts` — Centralized React Query cache keys
  - `sidebar-config.ts` — Sidebar state: categories, custom names, undo/redo stacks (useSyncExternalStore)
  - `modules.ts` — Enabled/disabled module IDs (useSyncExternalStore)
  - `keybindings.ts` — Configurable Cmd+key shortcuts (useSyncExternalStore)
  - `vault.ts` — Note CRUD via `/api/vault` Axum proxy
  - `themes.ts` — Theme definitions and CSS variable setters
  - `database.types.ts` — Generated TypeScript types from Supabase schema (via `npm run db:types`)
  - `sidebar-settings.ts` — Header visible, auto-hide title bar, logo visible (useSyncExternalStore)
  - `titlebar-settings.ts` — Title bar visibility and auto-hide config (useSyncExternalStore)
  - `preferences-sync.ts` — Multi-device preference sync to Supabase
  - `offline-queue.ts` — Queue for failed POST/PUT/DELETE mutations
  - `event-bus.ts` — Typed pub/sub (new-message, mission-updated, etc.)
  - `lru-cache.ts` — Generic LRU cache (used by avatar + link preview caches)
  - `migrations.ts` — localStorage schema version management
  - `demo-data.ts` — Fake data for open-source showcase mode

**frontend/src/pages/:**
- Purpose: Lazy-loaded route pages (one per major feature)
- Key files:
  - `Dashboard.tsx` — Agent status, heartbeats, memories, cron jobs
  - `Personal.tsx` — Morning brief, daily review, todos, homelab status
  - `Chat.tsx` — AI chat thread via OpenClaw WebSocket
  - `Messages.tsx` — iMessage conversation list + thread (35KB — largest component)
  - `Missions.tsx` — Agent task execution history with event replay
  - `Login.tsx` — OAuth flow and MFA verification
  - `Settings.tsx` — Lazy-loads 8 sub-panels: General, Connections, Sidebar, Keybindings, etc.
  - `Pomodoro.tsx` — Timer + activity heatmap
  - `Pipeline.tsx` — CI/CD pipeline status and execution
  - `Notes.tsx` — Obsidian vault file tree + editor + graph view
  - `KnowledgeBase.tsx` — Personal knowledge entries with tags
  - `Calendar.tsx` — Month + week view of events
  - `Crons.tsx` — Scheduled job grid
  - `Email.tsx` — Email account switcher + message list
  - `Agents.tsx` — Active agent cards
  - `Homelab.tsx` — Proxmox cluster stats, VMs, storage
  - `Search.tsx` — Global search results page

**src-tauri/src/routes/:**
- Purpose: API endpoint handlers organized by feature
- Key files (40+ total):
  - `messages.rs` — BlueBubbles proxy: chats list, thread, attachments, reactions, link preview cache, SQLite cache
  - `chat.rs` — OpenClaw proxy: WebSocket + SSE, CAS connection limits (5 concurrent), SSRF-safe image loading
  - `missions.rs` — Mission CRUD, event replay, status tracking
  - `auth.rs` — OAuth start/callback, MFA enrollment/verification, session refresh, logout
  - `todos.rs` — Todo CRUD with soft delete support
  - `vault.rs` — CouchDB proxy for Obsidian notes: chunk reassembly, image rendering, parent doc reconstruction
  - `reminders.rs` — Mac Bridge proxy: Reminder CRUD via `/reminder/*` endpoints
  - `status.rs` — Agent status polling, Tailscale peer verification, connection health checks
  - `homelab.rs` — Proxmox API proxy for cluster stats, VMs, storage, resource usage
  - `email.rs` — IMAP client: account setup, folder list, message fetch
  - `pipeline/` — CI/CD pipeline: spawn, review, complete, event streaming
  - `agents.rs` — Agent registry and status
  - `calendar.rs` — iCal parsing and event management
  - `media.rs` — Plex/Sonarr/Radarr integration
  - `knowledge.rs` — Knowledge base entry CRUD
  - `ideas.rs` — Idea capture and tracking
  - `decisions.rs` — Decision log with alternatives and outcomes
  - `captures.rs` — Quick capture (notes, tasks, ideas)
  - `habits.rs` — Habit tracking
  - `user_secrets.rs` — Encrypted credential storage (AES-256-GCM)
  - `preferences.rs` — Multi-device preference sync
  - `workspace.rs` — Custom workspace management
  - `util.rs` — Shared helpers (percent_encode, random_uuid, base64_decode)

**src-tauri/migrations/:**
- Purpose: Local SQLite schema versioning
- Files:
  - `0001_initial.sql` — Create tables: _sync_log, _conflict_log, _max_pulled, api_cache
  - `0002_security_events.sql` — security_events table for tamper detection
  - `0003_dev_session.sql` — _dev_session table (debug mode only, dropped on `#[cfg(debug_assertions)]` removal)
  - Plus 5 more for session storage, cache indexes, etc.

**supabase/migrations/:**
- Purpose: Remote Supabase PostgreSQL schema
- Files:
  - `20260301000000_initial.sql` — 19 core tables: missions, todos, agents, ideas, etc.
  - `20260308000000_habits.sql` — Habits tracking + entries
  - `20260308000001_mission_events.sql` — Mission event ingestion
  - `20260309000000_pipeline_columns.sql` — Pipeline schema additions
  - `20260316000000_rls_user_isolation.sql` — RLS policies + user_id on all tables
  - `20260316100000_user_profiles.sql` — User profiles + encryption_salt
  - `20260317000000_canary_tokens.sql` — Honeypot canary tokens
  - `20260317200000_security_fixes.sql` — FORCE RLS, append-only logs, revoke anon

## Key File Locations

**Entry Points:**
- `frontend/src/main.tsx` — React entry point (router, theme loader, query client)
- `src-tauri/src/main.rs` — Rust entry point (logging, security checks, Tauri setup)
- `src-tauri/src/server.rs` — Axum server initialization (middleware, router setup)

**Configuration:**
- `frontend/vite.config.ts` — Build config (API_BASE for dev, production)
- `src-tauri/tauri.conf.json` — Tauri app config (window size, capabilities, plugins)
- `src-tauri/Cargo.toml` — Rust dependencies (Axum, Tauri, tokio, sqlx, etc.)
- `frontend/package.json` — npm scripts (dev, build, test, e2e)
- `package.json` — Root scripts (db:*, tauri dev/build)

**Core Logic:**
- `src-tauri/src/routes/messages.rs` — 113KB, most complex (BlueBubbles caching, SSE dedup, link preview)
- `src-tauri/src/routes/chat.rs` — WebSocket handler, CAS connection limits
- `frontend/src/pages/Messages.tsx` — 35KB, full-featured message UI
- `src-tauri/src/sync.rs` — Offline-first sync engine (push/pull every 30s)
- `src-tauri/src/server.rs` — Auth middleware, session refresh, rate-limiting
- `frontend/src/lib/sidebar-config.ts` — Sidebar state machine with undo/redo

**Testing:**
- `frontend/src/lib/__tests__/` — Unit tests for api, audio, keybindings, migrations, modules
- `frontend/src/pages/**/__tests__/` — Page component tests
- `src-tauri/src/` — 231 Rust tests (run via `cargo test`)
- `scripts/e2e.sh` — 21 E2E tests (Playwright)
- `frontend/vitest.config.ts` — Vitest config (1039 tests across 53 files)

## Naming Conventions

**Files:**
- TypeScript/React: `PascalCase` for components (`.tsx`), `camelCase` for utilities (`.ts`)
  - Examples: `LayoutShell.tsx`, `useFocusTrap.ts`, `api.ts`, `sidebar-config.ts`
- Rust: `snake_case` for modules (`.rs`)
  - Examples: `messages.rs`, `service_client.rs`, `app_state.rs`
- Directories: `lowercase-kebab-case` or `lowercase` (no underscores)
  - Examples: `messages/`, `dashboard/`, `src-tauri/src/routes/`

**Functions/Variables:**
- Rust: `snake_case` for functions and variables; `PascalCase` for types and traits
  - Examples: `bb_fetch()`, `redact_bb_url()`, `UserSession`, `AppState`
- TypeScript: `camelCase` for functions and variables; `PascalCase` for components and types
  - Examples: `useLocalStorageState()`, `getKeybindings()`, `getSidebarConfig()`, `Dialog`, `Props`

**Constants:**
- Rust: `UPPER_SNAKE_CASE`
  - Examples: `MAX_WS_CONNECTIONS`, `SYNC_TABLES`, `SYSTEM_PROMPT`
- TypeScript: `UPPER_SNAKE_CASE` or `camelCase` (context-dependent)
  - Examples: `PREFETCH_ROUTES` (object), `logoStyle` (object literal)

**Routes/API:**
- Kebab-case for URL paths
  - Examples: `/api/messages/chats`, `/api/missions/:id/events`, `/api/user-secrets`

## Where to Add New Code

**New Feature (End-to-End Example: Add "Bookmarks" Module):**

1. **Frontend Route Page:**
   - Create: `frontend/src/pages/Bookmarks.tsx`
   - Pattern: Import `useQuery(queryKeys.bookmarks)`, render lazy-loaded component
   - Lazy-load in: `frontend/src/main.tsx` (add route in Routes)

2. **Frontend Utilities:**
   - Add query key: `frontend/src/lib/query-keys.ts` → `bookmarks: ['bookmarks'] as const`
   - Add API calls: `frontend/src/lib/api.ts` → `bookmarks: { list: () => api.get('/api/bookmarks'), ... }`
   - Add hooks: `frontend/src/hooks/bookmarks/useBookmarks.ts`

3. **Backend Route Handler:**
   - Create: `src-tauri/src/routes/bookmarks.rs`
   - Pattern: Use `RequireAuth` extractor, query SQLite, return JSON
   - Register: Add to `src-tauri/src/routes/mod.rs` → `pub mod bookmarks` + merge router

4. **Database:**
   - Local: Create migration in `src-tauri/migrations/000X_bookmarks.sql`
   - Remote: Create migration in `supabase/migrations/YYYYMMDDHHMMSS_bookmarks.sql`
   - Update sync list: `src-tauri/src/sync.rs` → `SYNC_TABLES`

5. **Sidebar:**
   - Add nav item: `frontend/src/lib/nav-items.ts` → personalDashboardItems
   - Module toggle: Auto-detected from nav-items; appears in Settings → Modules

**New Component:**
- Pattern: Use `React.memo` for frequently-rendered components (list items, avatars)
- File location: `frontend/src/components/` (shared) or `frontend/src/pages/{feature}/` (feature-specific)
- Props interface: Define immediately above component

**New Backend Route:**
- Pattern: Create handler function with `RequireAuth` extractor
- Error handling: Return `Result<impl IntoResponse, AppError>` (? operator converts errors)
- Database: Use parameterized queries (`sqlx::query_as` with `?` placeholders)
- Logging: `tracing::info!`, `tracing::warn!`, `tracing::error!` (no credential logging)

**New SQLite Migration:**
- File naming: `{src-tauri,supabase}/migrations/YYYYMMDDHHMMSS_description.sql`
- Format: SQL DDL (CREATE TABLE, CREATE INDEX, ALTER TABLE)
- Idempotence: Use `IF NOT EXISTS` for creates (not for drops)
- Testing: Run manually via `sqlx prepare` or in test suite

**Shared Utilities:**
- Frontend: `frontend/src/lib/` (no business logic, pure helpers)
- Backend: `src-tauri/src/` (modules at root level or under routes/)

## Special Directories

**frontend/src/pages/{feature}/:**
- Purpose: Feature-specific sub-components and types
- Pattern: Export main page component from `{Feature}.tsx`; sub-components in sub-directory
- Example structure:
  ```
  pages/messages/
  ├── Messages.tsx              # Main page component
  ├── ConversationList.tsx      # Sub-component
  ├── MessageThread.tsx         # Sub-component
  ├── ComposePanel.tsx          # Sub-component
  ├── types.ts                  # Feature-specific types
  └── utils.ts                  # Feature-specific helpers
  ```

**src-tauri/src/routes/pipeline/:**
- Purpose: Multi-file module for complex CI/CD pipeline logic
- Files:
  - `mod.rs` — Exports all sub-modules, builds router
  - `spawn.rs` — Start new mission/pipeline
  - `review.rs` — Code review logic
  - `complete.rs` — Mark complete and cleanup
  - `events.rs` — Event streaming (SSE)
  - `agents.rs` — Agent registry for pipeline
  - `helpers.rs` — Shared utilities
  - `registry.rs` — Agent registry management

**frontend/src/pages/settings/:**
- Purpose: 8 lazy-loaded settings panels + shared utilities
- Files:
  - `Settings.tsx` — Main container; lazy-loads sub-components
  - `General.tsx`, `Connections.tsx`, `Sidebar.tsx`, `Keybindings.tsx`, etc.
  - `shared.ts` — Shared types and helpers
  - `Toggle.tsx` — Reusable toggle component

**.planning/codebase/:**
- Purpose: GSD-generated codebase analysis documents
- Auto-generated by `/gsd:map-codebase` command
- Used by: `/gsd:plan-phase` and `/gsd:execute-phase` for context

---

*Structure analysis: 2026-03-19*
