-- Mission Control — Self-hosted Supabase Schema
-- Paste this into Supabase Studio > SQL Editor > Run

-- ============================================
-- Enable UUID generation
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Tables
-- ============================================

CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text TEXT,
  done BOOLEAN DEFAULT false,
  due_date DATE,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  assignee TEXT,
  status TEXT DEFAULT 'pending',
  complexity INTEGER,
  task_type TEXT,
  review_status TEXT,
  review_notes TEXT,
  routed_agent TEXT,
  spawn_command TEXT,
  log_path TEXT,
  progress INTEGER,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  emoji TEXT,
  role TEXT,
  status TEXT DEFAULT 'idle',
  current_task TEXT,
  color TEXT,
  model TEXT,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  why TEXT,
  effort TEXT,
  impact TEXT,
  category TEXT,
  status TEXT DEFAULT 'pending',
  mission_id UUID REFERENCES missions(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  decision TEXT NOT NULL,
  alternatives TEXT,
  rationale TEXT NOT NULL,
  outcome TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  linked_mission_id UUID REFERENCES missions(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '✅',
  color TEXT DEFAULT '#9b84ec',
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habit_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS capture_inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  routed_to TEXT,
  routed_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  note TEXT NOT NULL,
  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS changelog_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 993,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  tls BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES missions(id),
  event_type TEXT,
  content TEXT,
  file_path TEXT,
  seq INTEGER,
  elapsed_seconds INTEGER,
  tool_input TEXT,
  model_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_events_mission_id ON mission_events(mission_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID REFERENCES missions(id),
  agent_id TEXT,
  event_type TEXT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  accomplishments TEXT DEFAULT '',
  priorities TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start DATE NOT NULL UNIQUE,
  wins TEXT,
  incomplete_count INTEGER,
  priorities TEXT,
  reflection TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retrospectives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES missions(id),
  what_went_well TEXT,
  what_went_wrong TEXT,
  improvements TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT,
  agent_id TEXT,
  mission_id UUID,
  idea_id UUID,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT,
  type TEXT,
  source TEXT DEFAULT 'ios-shortcut',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Seed data: Agents
-- ============================================
INSERT INTO agents (id, display_name, emoji, role, status, current_task, model, sort_order) VALUES
  ('fast', 'Roman', '⚡', 'Fast worker (Haiku)', 'idle', '', 'claude-haiku-4-5', 1),
  ('sonnet', 'Sonnet', '🧩', 'Mid-tier worker (Sonnet)', 'idle', '', 'claude-sonnet-4-6', 2),
  ('koda', 'Gunther', '🔧', 'Heavy worker (Opus)', 'idle', '', 'claude-opus-4-6', 3),
  ('deep', 'Jiraiya', '🧠', 'Deep thinker (Opus)', 'idle', '', 'claude-opus-4-6', 4),
  ('review', 'Codex', '🔍', 'Code reviewer (Haiku)', 'idle', '', 'claude-haiku-4-5', 5)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Enable Realtime on tables the frontend subscribes to
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE todos;
ALTER PUBLICATION supabase_realtime ADD TABLE missions;
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
ALTER PUBLICATION supabase_realtime ADD TABLE cache;
ALTER PUBLICATION supabase_realtime ADD TABLE ideas;
