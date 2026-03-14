# Supabase Setup

Mission Control uses a self-hosted Supabase instance (via Docker Compose) as its primary database. This guide walks through getting Supabase running and connected to the app.

## Prerequisites

- Docker and Docker Compose
- Git

## 1. Clone and start Supabase

```bash
# Clone the official self-hosted Supabase repo
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# Copy the example env file
cp .env.example .env
```

Edit `.env` and change at minimum:

- `POSTGRES_PASSWORD` -- set a strong password
- `JWT_SECRET` -- generate one with `openssl rand -base64 32`
- `ANON_KEY` -- generate a JWT (see below)
- `SERVICE_ROLE_KEY` -- generate a JWT (see below)
- `SITE_URL` -- set to `http://localhost:5173` for local dev
- `ADDITIONAL_REDIRECT_URLS` -- add `http://localhost:3000/api/auth/callback`

### Generating JWT keys

Use the [Supabase JWT generator](https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys) or generate them manually:

```bash
# Install jwt-cli or use Node.js
node -e "
const jwt = require('jsonwebtoken');
const secret = 'your-jwt-secret-from-env';  // must match JWT_SECRET in .env
console.log('ANON_KEY:', jwt.sign({ role: 'anon', iss: 'supabase' }, secret, { expiresIn: '10y' }));
console.log('SERVICE_ROLE_KEY:', jwt.sign({ role: 'service_role', iss: 'supabase' }, secret, { expiresIn: '10y' }));
"
```

### Start the services

```bash
docker compose up -d
```

Supabase Studio will be available at `http://localhost:8000` (or the port you configured).

## 2. Run the database migration

Open the Supabase SQL Editor at `http://localhost:8000/project/default/sql` and paste the contents of:

```
supabase/migrations/001_initial.sql
```

Or run it via `psql`:

```bash
# Connect to the Supabase Postgres instance
psql "postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/postgres" \
  -f supabase/migrations/001_initial.sql
```

This creates all required tables, indexes, seeds the default agent roster, and enables Realtime on key tables.

### Incremental migrations

If you already have an older database, apply only the newer migration files in `supabase/migrations/` in order. The `001_initial.sql` migration uses `CREATE TABLE IF NOT EXISTS` and `ON CONFLICT DO NOTHING` so it is safe to re-run.

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
