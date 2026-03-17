-- ============================================================================
-- Mission Control: Initial Database Schema
-- ============================================================================
-- Run this in your Supabase SQL editor or as a migration.
-- All tables use UUID primary keys with gen_random_uuid() and timestamptz
-- columns for created_at / updated_at.
-- ============================================================================

-- ── Missions ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  assignee TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  task_type TEXT NOT NULL DEFAULT 'non-code',
  log_path TEXT,
  complexity INTEGER,
  spawn_command TEXT,
  routed_agent TEXT,
  review_status TEXT,       -- null | pending | approved | rejected
  review_notes TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS missions_status_idx ON missions(status);
CREATE INDEX IF NOT EXISTS missions_review_status_idx ON missions(review_status)
  WHERE review_status IS NOT NULL;

-- ── Mission Events ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  content TEXT NOT NULL,
  file_path TEXT,
  tool_input TEXT,
  tool_output TEXT,
  model_name TEXT,
  elapsed_seconds REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mission_events_mission_id_seq
  ON mission_events(mission_id, seq);

-- ── Todos ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  due_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Agents ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,       -- e.g. 'koda', 'fast', 'review'
  name TEXT NOT NULL,
  display_name TEXT,
  emoji TEXT,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  current_task TEXT DEFAULT '',
  model TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── User Preferences ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY DEFAULT 'default',
  preferences JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Ideas ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  why TEXT,
  effort TEXT,
  impact TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT,
  mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ideas_status_idx ON ideas(status);

-- ── Captures (Quick Capture) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  content TEXT,
  type TEXT DEFAULT 'note',
  source TEXT DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Knowledge Entries ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  tags TEXT[] DEFAULT '{}',
  source_url TEXT,
  source_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Changelog Entries ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS changelog_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT DEFAULT '',
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Decisions ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  decision TEXT NOT NULL,
  alternatives TEXT,
  rationale TEXT NOT NULL,
  outcome TEXT,
  tags JSONB DEFAULT '[]',
  linked_mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Daily Reviews ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL,
  accomplishments TEXT DEFAULT '',
  priorities TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_reviews_date_idx ON daily_reviews(date);

-- ── Weekly Reviews ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start TEXT NOT NULL,
  wins JSONB,
  incomplete_count JSONB,
  priorities JSONB,
  reflection JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_reviews_week_start_idx
  ON weekly_reviews(week_start);

-- ── Retrospectives ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS retrospectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
  what_went_well JSONB,
  what_went_wrong JSONB,
  improvements JSONB,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Habits ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✅',
  color TEXT NOT NULL DEFAULT '#9b84ec',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Habit Entries (one row per habit per day) ────────────────────────────────

CREATE TABLE IF NOT EXISTS habit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(habit_id, date)
);

CREATE INDEX IF NOT EXISTS habit_entries_habit_id_date_idx
  ON habit_entries(habit_id, date);

-- ── Workflow Notes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  note TEXT NOT NULL,
  applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Activity Log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id TEXT,
  agent_id TEXT,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_log_created_at_idx
  ON activity_log(created_at DESC);

-- ── Pipeline Events ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  agent_id TEXT,
  mission_id TEXT,
  idea_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_events_created_at_idx
  ON pipeline_events(created_at DESC);

-- ── Cache (server-side key-value cache) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Enable Realtime for key tables
-- ============================================================================

DO $$
BEGIN
  -- Only add tables that aren't already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'missions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE missions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mission_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mission_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'todos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE todos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'agents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agents;
  END IF;
END
$$;

-- ============================================================================
-- Seed: Default agents
-- ============================================================================
-- Insert the standard agent roster. ON CONFLICT ensures re-running is safe.

INSERT INTO agents (id, name, display_name, emoji, role, model, sort_order) VALUES
  ('koda',   'Koda',    'Gunther', '🛠️', 'primary',  'claude-opus-4-6',   1),
  ('fast',   'Fast',    'Roman',   '⚡',  'fast',     'claude-haiku-4-5',  2),
  ('sonnet', 'Sonnet',  'Sonnet',  '🧩',  'balanced', 'claude-sonnet-4-6', 3),
  ('deep',   'Deep',    'Jiraiya', '🧠',  'research', 'claude-opus-4-6',   4),
  ('review', 'Review',  'Codex',   '🔍',  'review',   'claude-haiku-4-5',  5)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Seed: Default user preferences row
-- ============================================================================

INSERT INTO user_preferences (user_id, preferences)
VALUES ('default', '{}')
ON CONFLICT (user_id) DO NOTHING;
