# SQLite Migration — Implementation Plan (Phase 2 of 3)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase with local SQLite so the app works offline with zero external database setup — every user gets their own local database.

**Architecture:** `sql.js` (WASM SQLite) runs inside the Node.js sidecar. A new `lib/db.ts` module provides typed query helpers that mirror the current Supabase call patterns. API routes swap `supabaseAdmin.from('table')` chains for direct SQL via `lib/db.ts`. Supabase Realtime subscriptions are replaced with Server-Sent Events (SSE) from a new `/api/db/changes` endpoint backed by an in-process EventEmitter.

**Tech Stack:** `sql.js` (WASM SQLite), Node.js `EventEmitter`, SSE, Next.js API routes

**Spec:** `docs/superpowers/specs/2026-03-11-tauri-desktop-app-design.md` (Section: Database — Local SQLite)

---

## File Structure

### New files to create:
```
lib/
  db.ts                               — SQLite connection singleton + query/run/get helpers
  db-events.ts                        — EventEmitter for table change notifications
  use-db-changes.ts                   — React hook: SSE subscription for realtime updates
migrations/
  001-initial-schema.sql              — All 21 table definitions
  002-seed-agents.sql                 — Seed agent rows matching ROUTING_TABLE
app/api/db/
  changes/route.ts                    — SSE endpoint streaming table change events
```

### Existing files to modify:
```
lib/supabase.ts                         — Delete (replaced by lib/db.ts)
lib/pipeline.ts                         — Swap supabaseAdmin calls for db helpers
app/api/todos/route.ts                  — Supabase to SQLite
app/api/missions/route.ts               — Supabase to SQLite
app/api/agents/route.ts                 — Supabase to SQLite
app/api/ideas/route.ts                  — Supabase to SQLite (cross-table: creates missions)
app/api/decisions/route.ts              — Supabase to SQLite (search with OR/LIKE)
app/api/knowledge/route.ts              — Supabase to SQLite (search + JSON tag filter)
app/api/workflow-notes/route.ts         — Supabase to SQLite
app/api/changelog/route.ts              — Supabase to SQLite
app/api/capture/route.ts                — Supabase to SQLite
app/api/habits/route.ts                 — Supabase to SQLite
app/api/habits/entries/route.ts         — Supabase to SQLite (toggle upsert)
app/api/email-accounts/route.ts         — Supabase to SQLite
app/api/email/route.ts                  — Supabase to SQLite (credential lookup)
app/api/cache-refresh/route.ts          — Supabase to SQLite
app/api/cache-refresh-slow/route.ts     — Supabase to SQLite
app/api/retrospectives/route.ts         — Supabase to SQLite (mission retros with tags)
app/api/prefs/route.ts                  — Supabase to SQLite (key-value prefs)
app/api/notify/route.ts                 — Supabase to SQLite (reads prefs for ntfy config)
app/api/pipeline-events/route.ts        — Supabase to SQLite (pipeline event log)
app/api/daily-review/route.ts           — Supabase to SQLite (daily review upsert)
app/api/weekly-review/route.ts          — Supabase to SQLite (weekly review upsert)
app/api/quick-capture/route.ts          — Supabase to SQLite (routes to todos/ideas/captures)
app/api/missions/sync-agents/route.ts   — Supabase to SQLite (process sync cleanup)
app/api/deploy/route.ts                 — Supabase to SQLite (review gate + agent reset)
app/api/dust/route.ts                   — Supabase to SQLite (cross-table dust query)
app/api/mission-events/bjorn/route.ts   — Supabase to SQLite (streaming event insert)
app/api/search/route.ts                 — Supabase to SQLite (cross-table LIKE)
app/api/stale/route.ts                  — Supabase to SQLite (cross-table date filters)
app/api/pipeline/spawn/route.ts         — Supabase to SQLite (complex workflow)
app/api/pipeline/complete/route.ts      — Supabase to SQLite (complex workflow)
app/api/pipeline/review/route.ts        — Supabase to SQLite (complex workflow)
app/api/mission-events/route.ts         — Supabase to SQLite (bulk insert)
app/page.tsx                            — Supabase Realtime to SSE hook
app/personal/page.tsx                   — Supabase Realtime to SSE hook
app/agents/page.tsx                     — Supabase Realtime to SSE hook
app/todos/page.tsx                      — Supabase Realtime to SSE hook
app/pipeline/page.tsx                   — Supabase Realtime to SSE hook
app/missions/page.tsx                   — Remove direct Supabase query, keep fetch path
package.json                            — Add sql.js, remove @supabase/supabase-js
.gitignore                              — Add *.db, *.db-wal, *.db-shm
src-tauri/src/sidecar.rs                — Pass MC_DB_PATH env var
```

---

## Key SQLite Differences from Supabase

Reference for all route migrations:

| Supabase Pattern | SQLite Equivalent |
|---|---|
| `supabaseAdmin.from('t').select('*')` | `dbAll('SELECT * FROM t')` |
| `.select().single()` | `dbGet('SELECT ... LIMIT 1')` |
| `.insert({...}).select().single()` | `dbRun('INSERT ...')` then `dbGet('SELECT ... WHERE id = ?')` |
| `.update({...}).eq('id', id)` | `dbRun('UPDATE t SET ... WHERE id = ?')` |
| `.delete().eq('id', id)` | `dbRun('DELETE FROM t WHERE id = ?')` |
| `.order('col', { ascending: false })` | `ORDER BY col DESC` |
| `.ilike('col', '%q%')` | `WHERE col LIKE ?` with `%q%` param |
| `.or('a.ilike.%q%,b.ilike.%q%')` | `WHERE a LIKE ? OR b LIKE ?` |
| `.contains('tags', [tag])` | `EXISTS (SELECT 1 FROM JSON_EACH(tags) WHERE value = ?)` |
| `.upsert({}, { onConflict: 'key' })` | `INSERT ... ON CONFLICT(key) DO UPDATE SET ...` |
| `.eq('done', false)` | `WHERE done = 0` (SQLite uses 0/1 for booleans) |
| `true` / `false` in inserts | `1` / `0` |
| JSON arrays (tags) | `TEXT` column with `JSON.stringify()`/`JSON.parse()` |
| UUID generation | `crypto.randomUUID()` in Node.js |

---

## Chunk 1: SQLite Foundation

### Task 1: Create the SQLite connection module (`lib/db.ts`)

**Files:**
- Create: `lib/db.ts`
- Modify: `package.json`

This is the foundational module every API route will import. It initializes sql.js with the WASM binary, opens/creates the database file at `MC_DB_PATH` (env var set by Rust, defaults to `./data.db` in dev), enables WAL mode, and applies migrations on first call.

- [ ] **Step 1: Install sql.js**

```bash
npm install sql.js
```

- [ ] **Step 2: Create `lib/db.ts`**

The module exports:
- `getDb()` — singleton database instance
- `persistDb()` — save to disk after writes
- `dbAll<T>(sql, params)` — SELECT multiple rows
- `dbGet<T>(sql, params)` — SELECT single row (or null)
- `dbRun(sql, params)` — INSERT/UPDATE/DELETE, returns `{ changes, lastId }`, auto-persists

Key implementation details:
- Uses `initSqlJs()` to load the WASM binary
- Reads existing DB file from `MC_DB_PATH` or creates new
- Runs `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`
- Scans `migrations/` directory for `*.sql` files, applies them in order
- Tracks applied migrations in a `_migrations` table
- `dbRun` calls `persistDb()` automatically after writes (saves the in-memory DB to disk)
- All functions are async (sql.js init is async, subsequent calls resolve immediately)

- [ ] **Step 3: Verify it compiles**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts package.json package-lock.json
git commit -m "feat: add SQLite connection module with sql.js (WASM)"
```

---

### Task 2: Create the database schema migration

**Files:**
- Create: `migrations/001-initial-schema.sql`

All 21 tables derived from current Supabase usage. See the Key SQLite Differences table above for type mappings.

- [ ] **Step 1: Create `migrations/001-initial-schema.sql`**

Tables to create (all use TEXT PRIMARY KEY for UUID ids, TEXT for timestamps as ISO 8601, TEXT for JSON arrays):

1. `todos` — id, text, done (INTEGER 0/1), snoozed_until, created_at, updated_at
2. `missions` — id, title, assignee, status, complexity, task_type, review_status, review_notes, routed_agent, spawn_command, log_path, progress, retry_count, created_at, updated_at
3. `ideas` — id, title, description, why, effort, impact, category, status, mission_id, created_at, updated_at
4. `agents` — id, display_name, emoji, role, status, current_task, color, model, sort_order, created_at, updated_at
5. `cache` — key (PRIMARY KEY), value (TEXT/JSON), updated_at
6. `email_accounts` — id, label, host, port, username, password, tls (INTEGER), is_default (INTEGER), created_at
7. `decisions` — id, title, decision, alternatives, rationale, outcome, tags (TEXT/JSON), linked_mission_id, created_at, updated_at
8. `knowledge_entries` — id, title, content, tags (TEXT/JSON), source_url, created_at, updated_at
9. `workflow_notes` — id, category, note, applied (INTEGER), created_at
10. `changelog_entries` — id, title, date, description, tags (TEXT/JSON), created_at
11. `habits` — id, name, emoji, color, sort_order, created_at
12. `habit_entries` — id, habit_id (FK to habits ON DELETE CASCADE), date, created_at, UNIQUE(habit_id, date)
13. `capture_inbox` — id, content, routed_to, routed_id, created_at
14. `mission_events` — id (INTEGER AUTOINCREMENT), mission_id, event_type, content, file_path, seq, elapsed_seconds, tool_input, model_name, created_at; INDEX on mission_id
15. `activity_log` — id (INTEGER AUTOINCREMENT), mission_id, agent_id, event_type, description, metadata (TEXT/JSON), created_at
16. `retrospectives` — id, mission_id, what_went_well, what_went_wrong, improvements, tags (TEXT/JSON), created_at
17. `prefs` — key (TEXT PRIMARY KEY), value (TEXT), updated_at
18. `pipeline_events` — id, event_type, agent_id, mission_id, idea_id, description, metadata (TEXT/JSON), created_at
19. `daily_reviews` — id, date (TEXT UNIQUE), accomplishments, priorities, notes, created_at
20. `weekly_reviews` — id, week_start (TEXT UNIQUE), wins, incomplete_count (INTEGER), priorities, reflection, created_at
21. `captures` — id, title, type, source, created_at

All default timestamps use `datetime('now')`.

- [ ] **Step 2: Verify migrations apply via build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add migrations/001-initial-schema.sql
git commit -m "feat: add SQLite schema — 21 tables matching current Supabase structure"
```

---

### Task 3: Create the SSE change notification system

**Files:**
- Create: `lib/db-events.ts`
- Create: `app/api/db/changes/route.ts`
- Create: `lib/use-db-changes.ts`

This replaces Supabase Realtime. When any API route writes to a table, it calls `emitChange('todos')`. The SSE endpoint streams these events to connected frontends.

- [ ] **Step 1: Create `lib/db-events.ts`**

Exports:
- `DbChangeEvent` interface: `{ table, event: INSERT|UPDATE|DELETE, id?, timestamp }`
- `emitChange(table, event, id?)` — emit after any write
- `onDbChange(listener)` — subscribe, returns unsubscribe function

Uses Node.js `EventEmitter` with `setMaxListeners(50)` for multiple SSE connections.

- [ ] **Step 2: Create `app/api/db/changes/route.ts`**

SSE endpoint using `ReadableStream`:
- Subscribes to `onDbChange()`, serializes events as `data: {...}\n\n`
- Sends keepalive comment every 30 seconds
- Cleans up subscription on client disconnect
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Mark as `export const dynamic = 'force-dynamic'`

- [ ] **Step 3: Create `lib/use-db-changes.ts`**

React hook (`'use client'`):
- `useDbChanges(tables: string[], onEvent: callback)`
- Creates `EventSource('/api/db/changes')`
- Filters events by table name, calls callback on match
- Auto-reconnects after 3 seconds on error
- Cleans up on unmount

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add lib/db-events.ts app/api/db/changes/route.ts lib/use-db-changes.ts
git commit -m "feat: add SSE change notification system replacing Supabase Realtime"
```

---

## Chunk 2: API Route Migration — Simple CRUD

All routes follow the same migration pattern:
1. Replace `import { supabaseAdmin } from '@/lib/supabase'` with `import { dbAll, dbGet, dbRun } from '@/lib/db'`
2. Add `import { emitChange } from '@/lib/db-events'`
3. Add `import crypto from 'crypto'` for UUID generation in POST handlers
4. Convert Supabase query chains to SQL (see Key Differences table)
5. Call `emitChange('tablename', 'INSERT'|'UPDATE'|'DELETE', id)` after writes
6. Parse JSON columns (tags) on read: `JSON.parse(row.tags || '[]')`
7. Stringify JSON columns on write: `JSON.stringify(tags || [])`

### Task 4: Migrate todos + missions + agents routes

**Files:**
- Modify: `app/api/todos/route.ts`
- Modify: `app/api/missions/route.ts`
- Modify: `app/api/missions/sync-agents/route.ts`
- Modify: `app/api/agents/route.ts`

Simplest CRUD routes — direct 1:1 mapping from Supabase to SQL. See current code for exact field lists.

- [ ] **Step 1: Migrate `app/api/todos/route.ts`**

GET: `SELECT * FROM todos ORDER BY created_at`
POST: `INSERT INTO todos (id, text, done, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`
PATCH: Dynamic `UPDATE todos SET ... WHERE id = ?` (done as 0/1, text)
DELETE: `DELETE FROM todos WHERE id = ?`

- [ ] **Step 2: Migrate `app/api/missions/route.ts`**

GET: `SELECT * FROM missions ORDER BY created_at`
POST: `INSERT INTO missions (id, title, assignee, status, created_at, updated_at) VALUES (...)`
PATCH: Dynamic `UPDATE missions SET status = ?, updated_at = ?, assignee = ? WHERE id = ?`
DELETE: `DELETE FROM missions WHERE id = ?`

- [ ] **Step 3: Migrate `app/api/agents/route.ts`**

GET: `SELECT * FROM agents ORDER BY sort_order ASC`
PATCH: Dynamic `UPDATE agents SET ... updated_at = ? WHERE id = ?` (allowed fields: display_name, emoji, role, status, current_task, color, model)

- [ ] **Step 4: Migrate `app/api/missions/sync-agents/route.ts`**

POST only. Detects running coding agent processes via `ps aux`, then:
- `dbAll('SELECT * FROM missions WHERE assignee = ? AND status IN (?, ?)', ['bjorn', 'active', 'pending'])`
- If no processes but active missions: `dbRun('UPDATE missions SET status = ?, updated_at = ? WHERE id = ?')` in a loop
- Delete stale: `dbRun('DELETE FROM missions WHERE title = ? AND assignee = ?', ['Coding Agent Task', 'bjorn'])`
- Delete old done: `dbRun('DELETE FROM missions WHERE assignee = ? AND status = ? AND updated_at < ?', ['bjorn', 'done', oneDayAgo])`

- [ ] **Step 5: Verify build + test with curl**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add app/api/todos/route.ts app/api/missions/route.ts app/api/missions/sync-agents/route.ts app/api/agents/route.ts
git commit -m "feat: migrate todos, missions, sync-agents, agents routes to SQLite"
```

---

### Task 5: Migrate ideas + decisions + knowledge routes

**Files:**
- Modify: `app/api/ideas/route.ts`
- Modify: `app/api/decisions/route.ts`
- Modify: `app/api/knowledge/route.ts`

These have search (LIKE), JSON array filtering (tags), and ideas has cross-table auto-mission creation on approval.

- [ ] **Step 1: Migrate `app/api/ideas/route.ts`**

Key: When `status === 'approved'`, insert a new mission row and set `mission_id` on the idea. Use `crypto.randomUUID()` for both IDs. Call `emitChange('missions', 'INSERT')` too.

- [ ] **Step 2: Migrate `app/api/decisions/route.ts`**

Key: Search uses `WHERE title LIKE ? OR decision LIKE ? OR rationale LIKE ?`. Tags stored as JSON TEXT — parse on read with `JSON.parse(row.tags || '[]')`, stringify on write.

- [ ] **Step 3: Migrate `app/api/knowledge/route.ts`**

Key: Tag filtering uses `EXISTS (SELECT 1 FROM JSON_EACH(tags) WHERE value = ?)`. DELETE reads id from searchParams (not body).

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/api/ideas/route.ts app/api/decisions/route.ts app/api/knowledge/route.ts
git commit -m "feat: migrate ideas, decisions, knowledge routes to SQLite"
```

---

### Task 6: Migrate workflow-notes, changelog, capture, habits, retrospectives, prefs, notify, quick-capture, reviews routes

**Files:**
- Modify: `app/api/workflow-notes/route.ts`
- Modify: `app/api/changelog/route.ts`
- Modify: `app/api/capture/route.ts`
- Modify: `app/api/habits/route.ts`
- Modify: `app/api/habits/entries/route.ts`
- Modify: `app/api/retrospectives/route.ts`
- Modify: `app/api/prefs/route.ts`
- Modify: `app/api/notify/route.ts`
- Modify: `app/api/quick-capture/route.ts`
- Modify: `app/api/pipeline-events/route.ts`
- Modify: `app/api/daily-review/route.ts`
- Modify: `app/api/weekly-review/route.ts`

All straightforward CRUD. Notable: capture_inbox GET sorts null routed_to first (`ORDER BY CASE WHEN routed_to IS NULL THEN 0 ELSE 1 END`). Habit entries POST toggles — check exists, delete if yes, insert if no.

- [ ] **Step 1: Migrate workflow-notes, changelog, capture, habits (5 files)**

Follow the standard pattern. For habit_entries toggle: `SELECT id FROM habit_entries WHERE habit_id = ? AND date = ?` — if found delete, else insert.

- [ ] **Step 2: Migrate `app/api/retrospectives/route.ts`**

GET: `SELECT * FROM retrospectives ORDER BY created_at DESC`
POST: `INSERT INTO retrospectives (id, mission_id, what_went_well, what_went_wrong, improvements, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
- `tags` stored as JSON TEXT — `JSON.stringify(tags || [])` on write, `JSON.parse(row.tags || '[]')` on read

- [ ] **Step 3: Migrate `app/api/prefs/route.ts`**

GET: `SELECT * FROM prefs ORDER BY key ASC`
PATCH: `UPDATE prefs SET value = ?, updated_at = ? WHERE key = ?`

- [ ] **Step 4: Migrate `app/api/notify/route.ts`**

Only change `getNtfyConfig()` — replace Supabase query with:
`dbAll('SELECT key, value FROM prefs WHERE key IN (?, ?)', ['ntfy_url', 'ntfy_topic'])`
Keep all ntfy POST logic, SSRF protection, and caching unchanged.

- [ ] **Step 5: Migrate `app/api/quick-capture/route.ts`**

Routes to different tables based on `type`:
- `Task` → `INSERT INTO todos (id, text, done, created_at) VALUES (?, ?, 0, ?)`
- `Idea` → `INSERT INTO ideas (id, title, status, created_at) VALUES (?, ?, 'pending', ?)`
- `Note`/`Decision` → `INSERT INTO captures (id, title, type, source, created_at) VALUES (?, ?, ?, ?, ?)` (no fallback needed — we create the `captures` table in the schema)

- [ ] **Step 6: Migrate `app/api/pipeline-events/route.ts`**

GET: `SELECT * FROM pipeline_events ORDER BY created_at DESC LIMIT 50`
POST: `INSERT INTO pipeline_events (id, event_type, agent_id, mission_id, idea_id, description, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
- `metadata` stored as JSON TEXT

- [ ] **Step 7: Migrate `app/api/daily-review/route.ts`**

GET: `SELECT * FROM daily_reviews WHERE date = ? ORDER BY created_at DESC LIMIT 1`
POST (upsert): `INSERT INTO daily_reviews (id, date, accomplishments, priorities, notes, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET accomplishments = excluded.accomplishments, priorities = excluded.priorities, notes = excluded.notes`

- [ ] **Step 8: Migrate `app/api/weekly-review/route.ts`**

GET: If `week_start` param: `SELECT * FROM weekly_reviews WHERE week_start = ?`; else: `SELECT * FROM weekly_reviews ORDER BY week_start DESC LIMIT 10`
POST (upsert): `INSERT INTO weekly_reviews (id, week_start, wins, incomplete_count, priorities, reflection, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(week_start) DO UPDATE SET wins = excluded.wins, incomplete_count = excluded.incomplete_count, priorities = excluded.priorities, reflection = excluded.reflection`

- [ ] **Step 9: Verify build**

```bash
npm run build
```

- [ ] **Step 10: Commit**

```bash
git add app/api/workflow-notes/route.ts app/api/changelog/route.ts app/api/capture/route.ts app/api/habits/route.ts app/api/habits/entries/route.ts app/api/retrospectives/route.ts app/api/prefs/route.ts app/api/notify/route.ts app/api/quick-capture/route.ts app/api/pipeline-events/route.ts app/api/daily-review/route.ts app/api/weekly-review/route.ts
git commit -m "feat: migrate remaining simple CRUD routes to SQLite"
```

---

### Task 7: Migrate email-accounts + cache-refresh routes

**Files:**
- Modify: `app/api/email-accounts/route.ts`
- Modify: `app/api/email/route.ts` (credential lookup function only)
- Modify: `app/api/cache-refresh/route.ts`
- Modify: `app/api/cache-refresh-slow/route.ts`

**Note on email passwords:** Currently stored in plaintext in Supabase. They stay in SQLite for now — migrating per-account passwords to the OS keychain is a Phase 3 task (requires Tauri IPC bridge).

- [ ] **Step 1: Migrate `app/api/email-accounts/route.ts`**

POST with `is_default`: first `UPDATE email_accounts SET is_default = 0`, then insert. Boolean tls/is_default stored as INTEGER 0/1.

- [ ] **Step 2: Update credential lookup in `app/api/email/route.ts`**

Only change the `getCredentials()` function. Replace Supabase queries with:
- `dbGet('SELECT host, port, username, password, tls FROM email_accounts WHERE id = ?', [accountId])`
- `dbGet('... WHERE is_default = 1')`
- Fallback to env vars unchanged

Keep all IMAP logic untouched.

- [ ] **Step 3: Migrate `app/api/cache-refresh/route.ts`**

Cache upsert: `INSERT INTO cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`

Cache read: `SELECT * FROM cache`, parse JSON values.

- [ ] **Step 4: Migrate `app/api/cache-refresh-slow/route.ts`**

Same upsert pattern for proxmox and opnsense keys.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add app/api/email-accounts/route.ts app/api/email/route.ts app/api/cache-refresh/route.ts app/api/cache-refresh-slow/route.ts
git commit -m "feat: migrate email-accounts, email, cache-refresh routes to SQLite"
```

---

### Task 8: Migrate search + stale + dust routes

**Files:**
- Modify: `app/api/search/route.ts`
- Modify: `app/api/stale/route.ts`
- Modify: `app/api/dust/route.ts`

Cross-table queries with date filters and LIKE searches.

- [ ] **Step 1: Migrate `app/api/search/route.ts`**

Replace only the Supabase todos+missions queries:
- `dbAll('SELECT id, text, done, created_at FROM todos WHERE text LIKE ? LIMIT 20', [pattern])`
- `dbAll('SELECT id, title, status, created_at FROM missions WHERE title LIKE ? LIMIT 20', [pattern])`

Remove `supabaseAdmin` null checks. Keep all external API calls (calendar, email, reminders, knowledge) unchanged.

- [ ] **Step 2: Migrate `app/api/stale/route.ts`**

Three parallel queries with date comparisons:
- Todos: `WHERE done = 0 AND updated_at < ?` (7 days ago) `AND (snoozed_until IS NULL OR snoozed_until < ?)` (now)
- Missions: `WHERE status = 'active' AND updated_at < ?` (1 day ago)
- Ideas: `WHERE status = 'pending' AND created_at < ?` (3 days ago)

PATCH actions (snooze/done) and DELETE use same table routing as current code.

- [ ] **Step 3: Migrate `app/api/dust/route.ts`**

GET only, three parallel queries (similar to stale but different thresholds and no write ops):
- Todos: `SELECT * FROM todos WHERE done = 0 AND created_at < ? ORDER BY created_at` (14 days ago)
- Ideas: `SELECT * FROM ideas WHERE status = 'approved' AND mission_id IS NULL AND updated_at < ? ORDER BY updated_at` (7 days ago)
- Missions: `SELECT * FROM missions WHERE status IN ('active', 'pending') AND updated_at < ? ORDER BY updated_at` (7 days ago)

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/api/search/route.ts app/api/stale/route.ts app/api/dust/route.ts
git commit -m "feat: migrate search, stale, dust routes to SQLite"
```

---

## Chunk 3: Pipeline and Complex Routes

### Task 9: Migrate `lib/pipeline.ts`

**Files:**
- Modify: `lib/pipeline.ts`

Replace `import { supabaseAdmin } from '@/lib/supabase'` with imports from `@/lib/db` and `@/lib/db-events`.

Functions to migrate:
- `setAgentActive(agentId, task)` — `dbRun('UPDATE agents SET status = ?, current_task = ?, updated_at = ? WHERE id = ?')` + `emitChange('agents', 'UPDATE')`
- `setAgentIdle(agentId)` — same pattern with IDLE status
- `logActivity(params)` — `dbRun('INSERT INTO activity_log ...')` fire-and-forget (`.catch(() => {})`)
- `ingestLog(missionId, logPath, durationSec, mode)` — delete existing if replace mode, get max seq if append, loop insert rows into mission_events
- `appendLog(missionId, logPath, durationSec)` — calls ingestLog with mode='append'

All other functions (routing table, notifications, registry, spawn, validation) are unchanged — they don't touch Supabase.

- [ ] **Step 1: Update imports and migrate all 4 functions**
- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline.ts
git commit -m "feat: migrate lib/pipeline.ts helpers from Supabase to SQLite"
```

---

### Task 10: Migrate pipeline routes (spawn, complete, review, mission-events, deploy)

**Files:**
- Modify: `app/api/pipeline/spawn/route.ts`
- Modify: `app/api/pipeline/complete/route.ts`
- Modify: `app/api/pipeline/review/route.ts`
- Modify: `app/api/mission-events/route.ts`
- Modify: `app/api/mission-events/bjorn/route.ts`
- Modify: `app/api/deploy/route.ts`

These are the most complex routes — multi-table writes with agent state management. Replace `supabaseAdmin` import with `dbGet`/`dbRun`/`dbAll` from `@/lib/db`, add `emitChange` calls, add `crypto` import for UUID generation.

Key patterns per route:

**pipeline/spawn:**
- Agent availability check: `dbGet('SELECT status, current_task FROM agents WHERE id = ?', [route.agentId])`
- Mission creation: `dbRun('INSERT INTO missions ...', [...])` with `crypto.randomUUID()`
- Follow-up update: `dbRun('UPDATE missions SET spawn_command = ? WHERE id = ?')`
- Rollback on failure: `dbRun('DELETE FROM missions WHERE id = ?')`
- Agent state: uses `setAgentActive()` from already-migrated pipeline.ts

**pipeline/complete:**
- Mission fetch: `dbGet('SELECT * FROM missions WHERE id = ?', [mission_id])`
- Status guard: check `mission.status` and `mission.review_status`
- Failure path: `dbRun('UPDATE missions SET status = ?, retry_count = ? ... WHERE id = ?')`
- Code task success: update mission to AWAITING_REVIEW, spawn Codex
- Non-code success: update mission to DONE
- All agent state via already-migrated `setAgentIdle`/`setAgentActive`

**pipeline/review:**
- Mission fetch + status guard
- Approved: update mission to DONE + APPROVED
- Rejected: update mission to ACTIVE + REJECTED, spawn Gunther fix

**mission-events:**
- GET with ingest action: read log, parse, delete existing, bulk insert
- GET standard: `dbAll('SELECT * FROM mission_events WHERE mission_id = ? ORDER BY seq ASC')`
- POST: parse log content, delete existing, bulk insert
- Mission duration lookup: `dbGet('SELECT created_at, updated_at FROM missions WHERE id = ?')`

- [ ] **Step 1: Migrate pipeline/spawn, pipeline/complete, pipeline/review, mission-events (4 files)**

For each file: replace supabaseAdmin import, swap queries, add emitChange + crypto imports.

- [ ] **Step 2: Migrate `app/api/mission-events/bjorn/route.ts`**

POST only. Streaming event insert for live coding agent output:
- Get next seq: `dbGet('SELECT MAX(seq) as max_seq FROM mission_events WHERE mission_id = ?', [mission_id])`
- Insert: `dbRun('INSERT INTO mission_events (mission_id, event_type, content, elapsed_seconds, seq, created_at) VALUES (?, ?, ?, ?, ?, ?)')`

- [ ] **Step 3: Migrate `app/api/deploy/route.ts`**

POST only. Two Supabase queries to replace:
- Review gate: `dbAll('SELECT id, title, review_status FROM missions WHERE review_status = ?', [REVIEW_STATUS.PENDING])`
- Agent reset after deploy: `dbRun('UPDATE agents SET status = ?, updated_at = ? WHERE status = ?', [AGENT_STATUS.IDLE, now, AGENT_STATUS.AWAITING_DEPLOY])`
Keep all `execSync`, `spawn`, token gating, and notify logic unchanged.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/api/pipeline/spawn/route.ts app/api/pipeline/complete/route.ts app/api/pipeline/review/route.ts app/api/mission-events/route.ts app/api/mission-events/bjorn/route.ts app/api/deploy/route.ts
git commit -m "feat: migrate pipeline, mission-events, deploy routes to SQLite"
```

---

## Chunk 4: Frontend Realtime + Cleanup

### Task 11: Migrate frontend pages from Supabase Realtime to SSE

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/personal/page.tsx`
- Modify: `app/agents/page.tsx`
- Modify: `app/todos/page.tsx`
- Modify: `app/pipeline/page.tsx`

For each page:
1. Remove `import { supabase } from '@/lib/supabase'` and any `RealtimePostgresChangesPayload` type imports
2. Add `import { useDbChanges } from '@/lib/use-db-changes'`
3. Replace `supabase.channel(...)...on('postgres_changes', ...)...subscribe()` + cleanup with `useDbChanges(['table'], callback)`
4. Replace any direct `supabase.from('cache').select(...)` client-side queries with `fetch('/api/cache-refresh')` GET

**Mapping per page:**

| Page | Current Channels | Replacement |
|---|---|---|
| `app/page.tsx` | todos, missions, agents, cache (4 channels) | `useDbChanges(['todos'], fetchTodos)`, `useDbChanges(['missions'], fetchMissions)`, `useDbChanges(['agents'], fetchAgents)`, `useDbChanges(['cache'], fetchCacheData)` |
| `app/personal/page.tsx` | todos, cache (2 channels) | `useDbChanges(['todos'], fetchTodos)`, `useDbChanges(['cache'], fetchProxmox)` |
| `app/agents/page.tsx` | agents (1 channel) | `useDbChanges(['agents'], fetchAgents)` |
| `app/todos/page.tsx` | todos (1 channel) | `useDbChanges(['todos'], fetchTodos)` |
| `app/pipeline/page.tsx` | ideas (1 channel) | `useDbChanges(['ideas'], fetchIdeas)` |
| `app/missions/page.tsx` | direct supabase query (no channels) | Remove supabase import, keep `fetch('/api/missions')` path, add `useDbChanges(['missions'], fetchMissions)` |

Remove all `supabase.removeChannel()` cleanup — the hook handles its own cleanup via useEffect return.

- [ ] **Step 1: Migrate `app/page.tsx`** — 4 channels to 4 hook calls
- [ ] **Step 2: Migrate `app/personal/page.tsx`** — 2 channels + direct cache query
- [ ] **Step 3: Migrate `app/agents/page.tsx`** — 1 channel
- [ ] **Step 4: Migrate `app/todos/page.tsx`** — 1 channel
- [ ] **Step 5: Migrate `app/pipeline/page.tsx`** — 1 channel
- [ ] **Step 6: Migrate `app/missions/page.tsx`** — remove direct Supabase query

This page has a dual path: `if (supabase) { directQuery } else { fetch('/api/missions') }`. Remove the supabase import and direct query branch entirely — keep only the `fetch('/api/missions')` path. Optionally add `useDbChanges(['missions'], fetchMissions)` for realtime updates.

- [ ] **Step 7: Verify build**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx app/personal/page.tsx app/agents/page.tsx app/todos/page.tsx app/pipeline/page.tsx app/missions/page.tsx
git commit -m "feat: migrate all frontend pages from Supabase Realtime to SSE"
```

---

### Task 12: Remove Supabase dependency + seed agents + gitignore + final verification

**Files:**
- Modify: `package.json` — remove `@supabase/supabase-js`
- Delete: `lib/supabase.ts`
- Create: `migrations/002-seed-agents.sql`
- Modify: `.gitignore` — add database files

- [ ] **Step 1: Create `migrations/002-seed-agents.sql`**

Seed the 5 agents from `lib/pipeline.ts` ROUTING_TABLE:
```sql
INSERT OR IGNORE INTO agents (id, display_name, emoji, role, status, current_task, model, sort_order) VALUES
  ('fast', 'Roman', (lightning emoji), 'Fast worker (Haiku)', 'idle', '', 'claude-haiku-4-5', 1),
  ('sonnet', 'Sonnet', (puzzle emoji), 'Mid-tier worker (Sonnet)', 'idle', '', 'claude-sonnet-4-6', 2),
  ('koda', 'Gunther', (wrench emoji), 'Heavy worker (Opus)', 'idle', '', 'claude-opus-4-6', 3),
  ('deep', 'Jiraiya', (brain emoji), 'Deep thinker (Opus)', 'idle', '', 'claude-opus-4-6', 4),
  ('review', 'Codex', (magnifying glass emoji), 'Code reviewer (Haiku)', 'idle', '', 'claude-haiku-4-5', 5);
```

(Use actual emoji characters in the real file, not descriptions.)

- [ ] **Step 2: Remove Supabase**

```bash
npm uninstall @supabase/supabase-js
```

- [ ] **Step 3: Delete `lib/supabase.ts`**

```bash
rm lib/supabase.ts
```

- [ ] **Step 4: Verify no remaining Supabase imports**

```bash
grep -r "from.*supabase" app/ lib/ --include="*.ts" --include="*.tsx"
```

Expected: No matches. If any remain, fix them.

- [ ] **Step 5: Add database files to `.gitignore`**

Append to `.gitignore`:
```
# SQLite database files
*.db
*.db-wal
*.db-shm
*.db-journal
*.db.bak.*
```

- [ ] **Step 6: Full build verification**

```bash
npm run build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 7: Manual smoke test**

Start dev server and verify:
- `GET /api/todos` returns `{ todos: [] }`
- `POST /api/todos` creates a todo and returns it with a UUID
- `GET /api/agents` returns the 5 seeded agents
- `GET /api/db/changes` streams SSE events when writes happen

- [ ] **Step 8: Commit**

```bash
git add migrations/002-seed-agents.sql package.json package-lock.json .gitignore
git rm lib/supabase.ts
git commit -m "feat: remove Supabase dependency, seed agents, complete SQLite migration"
```

---

## Chunk 5: Backup, Tauri Integration, and Hardening

### Task 13: Add automatic database backup and integrity check on startup

**Files:**
- Modify: `lib/db.ts`

Add backup and integrity check during `getDb()` initialization (after opening the DB, before running migrations). If the DB is corrupt, auto-restore from the most recent backup.

- [ ] **Step 1: Add backup + integrity check logic to `lib/db.ts`**

After the DB file is opened and before migrations run:

**Backup rotation:**
- Copy `data.db` to `data.db.bak.1`
- If `data.db.bak.1` already exists, rotate: `.bak.2` → `.bak.3` (delete), `.bak.1` → `.bak.2`, then copy current to `.bak.1`
- Only backup if the DB file already exists and is non-empty (skip on first run)
- Use `fs.copyFileSync()` — simple and reliable

**Integrity check:**
- After backup, run `PRAGMA integrity_check` on the opened DB
- If result is not `'ok'`, log a warning and attempt recovery:
  - Close the DB
  - Copy the most recent `.bak.N` file back to `data.db`
  - Re-open the DB
  - Log: `[db] Restored from backup after integrity check failure`
- If no backup exists, continue with the potentially corrupt DB (best effort)

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add automatic SQLite backup rotation and integrity check on startup"
```

---

### Task 14: Wire SQLite database path from Rust to Node.js sidecar

**Files:**
- Modify: `src-tauri/src/sidecar.rs`

The Rust side needs to pass `MC_DB_PATH` to the sidecar so it knows where to store the database in the platform-appropriate app data directory.

- [ ] **Step 1: Add `MC_DB_PATH` to sidecar env vars**

In `sidecar.rs`, the `spawn_sidecar` function already passes env vars and hardcoded envs (PORT, HOSTNAME, NODE_ENV). Add `MC_DB_PATH`:

```rust
.env("MC_DB_PATH", get_db_path(app))
```

Add helper function:
```rust
fn get_db_path(app: &AppHandle) -> String {
    let app_data = app.path().app_data_dir().expect("failed to get app data dir");
    std::fs::create_dir_all(&app_data).ok();
    app_data.join("data.db").to_string_lossy().to_string()
}
```

This produces platform-specific paths:
- macOS: `~/Library/Application Support/com.mission-control.desktop/data.db`
- Windows: `%APPDATA%/com.mission-control.desktop/data.db`
- Linux: `~/.local/share/com.mission-control.desktop/data.db`

- [ ] **Step 2: Verify Rust compilation**

```bash
cd src-tauri && ~/.cargo/bin/cargo check
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/sidecar.rs
git commit -m "feat: pass MC_DB_PATH from Rust to Node.js sidecar"
```

---

## Summary

After completing all 14 tasks, you'll have:
- Local SQLite database replacing Supabase (21 tables, zero external setup)
- `lib/db.ts` — sql.js WASM connection with typed query helpers
- All 39 Supabase-dependent files migrated from Supabase query builder to direct SQL (+ lib/supabase.ts deleted)
- `lib/pipeline.ts` migrated (agent status, activity logging, log ingestion)
- SSE change notification system replacing Supabase Realtime (5 frontend pages)
- `@supabase/supabase-js` removed from dependencies
- Agent seed data in migration
- Automatic backup rotation (3 copies) + integrity check on startup
- Database path wired from Rust to Node.js sidecar
- `.gitignore` updated for database and backup files

**Deferred to Phase 3:** Email account passwords migration from SQLite to OS keychain (requires Tauri IPC bridge).

**Next plan:** Phase 3 — Setup Wizard + CI/CD + Auto-Updates
