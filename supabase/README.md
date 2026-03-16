# Supabase Setup

Mission Control uses a self-hosted Supabase instance (via Docker Compose) as its primary database. This guide walks through getting Supabase running and connected to the app.

## Prerequisites

- Docker and Docker Compose
- Git

## 1. Start Supabase

### Option A: Use the included docker-compose (recommended)

This repo includes a minimal docker-compose with 6 services (PostgreSQL, PostgREST, Auth, Realtime, Storage, pg-meta).

```bash
cd supabase

# Copy the template files
cp docker-compose.example.yml docker-compose.yml
cp .env.example .env
```

Edit `.env` and set real values:

```bash
# Generate secrets
openssl rand -base64 24   # use for POSTGRES_PASSWORD
openssl rand -base64 32   # use for JWT_SECRET
```

Then generate `ANON_KEY` and `SERVICE_ROLE_KEY` from your `JWT_SECRET` (see "Generating JWT keys" below).

```bash
docker compose up -d
```

### Option B: Use the full Supabase stack

For the complete stack (Studio, Edge Functions, etc.):

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, SITE_URL
docker compose up -d
```

See the [official self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker) for details.

### Generating JWT keys

Use the [Supabase JWT generator](https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys) or generate them manually:

```bash
# Requires: npm install -g jsonwebtoken (or use npx)
node -e "
const jwt = require('jsonwebtoken');
const secret = 'your-jwt-secret-from-env';  // must match JWT_SECRET in .env
console.log('ANON_KEY:', jwt.sign({ role: 'anon', iss: 'supabase' }, secret, { expiresIn: '10y' }));
console.log('SERVICE_ROLE_KEY:', jwt.sign({ role: 'service_role', iss: 'supabase' }, secret, { expiresIn: '10y' }));
"
```

## 2. Run the database migration

Apply all migrations in order. You can use the Supabase CLI or `psql` directly:

```bash
# Option 1: Supabase CLI (if configured)
supabase db push --db-url postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/postgres

# Option 2: psql — run each migration in order
for f in supabase/migrations/*.sql; do
  psql "postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/postgres" -f "$f"
done
```

Migration files (in `supabase/migrations/`):

| File | Purpose |
|---|---|
| `20260301000000_initial.sql` | 19 tables, indexes, Realtime publication, agent seeds |
| `20260308000000_habits.sql` | Habit tracking tables |
| `20260308000001_mission_events.sql` | Mission event enhancements |
| `20260309000000_pipeline_columns.sql` | Pipeline column additions |

All migrations use `CREATE TABLE IF NOT EXISTS`, `IF NOT EXISTS`, and `ON CONFLICT DO NOTHING` so they are safe to re-run.

## 3. Configure Mission Control

Create a `.env.local` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env.local
```

Set the Supabase-related variables:

```env
# Supabase connection (required)
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Where to find these values:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase instance URL. For local Docker: `http://localhost:8000` |
| `VITE_SUPABASE_ANON_KEY` | The `ANON_KEY` from your Supabase `.env` file |
| `SUPABASE_SERVICE_ROLE_KEY` | The `SERVICE_ROLE_KEY` from your Supabase `.env` file |

The anon key is used by the frontend for auth flows (PKCE). The service role key is used by the Rust backend for unrestricted database access.

## 4. Enable OAuth (optional)

If you want user authentication:

1. In Supabase Studio, go to **Authentication > Providers**
2. Enable your preferred provider (GitHub, Google, etc.)
3. Set the redirect URL to `http://localhost:3000/api/auth/callback`
4. Add the provider's client ID and secret

The app handles the full PKCE flow automatically through the Tauri backend.

## Table overview

| Table | Purpose |
|---|---|
| `missions` | Task/mission tracking with status, progress, pipeline routing |
| `mission_events` | Detailed event log per mission (tool calls, results, thinking) |
| `todos` | Simple todo list |
| `agents` | AI agent roster and status |
| `user_preferences` | JSONB preferences blob per user |
| `ideas` | Idea backlog with approval workflow |
| `captures` | Quick-capture notes from iOS Shortcuts or web |
| `knowledge_entries` | Knowledge base with tag-based search |
| `changelog_entries` | Project changelog |
| `decisions` | Architecture/design decision records |
| `daily_reviews` | Daily standup notes |
| `weekly_reviews` | Weekly review summaries |
| `retrospectives` | Post-mission retrospectives |
| `habits` | Habit definitions |
| `habit_entries` | Daily habit completion tracking |
| `workflow_notes` | Workflow improvement notes |
| `activity_log` | Pipeline activity audit trail |
| `pipeline_events` | Pipeline event stream |
| `cache` | Server-side key-value cache |

## Troubleshooting

### "SUPABASE_URL not set" or "SUPABASE_SERVICE_ROLE_KEY not set"

The Rust backend reads these from the OS keychain (via `src-tauri/src/secrets.rs`) or from `.env.local`. Make sure both values are set.

### "supabase select/insert returned 401"

The service role key is incorrect or expired. Regenerate it using the same `JWT_SECRET` as your Supabase instance.

### Tables not found (404 from PostgREST)

Run the migration SQL. PostgREST auto-discovers tables in the `public` schema -- no restart needed after running migrations.

### Realtime not working

Ensure the tables are added to the `supabase_realtime` publication. The migration handles this, but you can verify:

```sql
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```
