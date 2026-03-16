-- ============================================================================
-- Mission Control: RLS User Isolation
-- ============================================================================
-- Adds user_id, updated_at, deleted_at to all 19 tables.
-- Enables Row Level Security with per-user isolation policies.
-- Creates user_secrets, user_usage, and chat_audit_log tables.
--
-- IMPORTANT: Before running on production, replace the placeholder UUID
-- '00000000-0000-0000-0000-000000000000' in the backfill block with your
-- actual auth.users UUID (find it in Authentication → Users in the Supabase
-- dashboard).
--
-- The migration is wrapped in a transaction and uses IF NOT EXISTS / IF EXISTS
-- guards so it can be re-run safely.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Shared trigger function: keep updated_at current on every UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Handle user_preferences FIRST — it has a TEXT primary key named user_id
--    that must be replaced before we can add a proper UUID user_id column.
-- ============================================================================

-- Drop the old TEXT primary key and rename the column out of the way
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_pkey;
ALTER TABLE user_preferences RENAME COLUMN user_id TO old_user_id;

-- Add a proper surrogate UUID primary key
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Add the new UUID user_id (nullable for now; backfilled below)
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE CASCADE;

-- Add missing columns
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================================================
-- 3. Add user_id, updated_at, deleted_at to the remaining 18 tables
-- ============================================================================

-- missions (already has updated_at)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS user_id   UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE missions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- mission_events (no updated_at in original schema)
ALTER TABLE mission_events ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE mission_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE mission_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- todos (already has updated_at)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE todos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- agents (already has updated_at)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ideas (already has updated_at)
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- captures (no updated_at)
ALTER TABLE captures ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE captures ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- knowledge_entries (no updated_at)
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- changelog_entries (no updated_at)
ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- decisions (already has updated_at)
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- daily_reviews (no updated_at)
ALTER TABLE daily_reviews ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE daily_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE daily_reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- weekly_reviews (no updated_at)
ALTER TABLE weekly_reviews ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE weekly_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE weekly_reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- retrospectives (no updated_at)
ALTER TABLE retrospectives ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE retrospectives ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE retrospectives ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- habits (no updated_at)
ALTER TABLE habits ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE habits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- habit_entries (no updated_at)
ALTER TABLE habit_entries ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE habit_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE habit_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- workflow_notes (no updated_at)
ALTER TABLE workflow_notes ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE workflow_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE workflow_notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- activity_log (no updated_at)
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- pipeline_events (no updated_at)
ALTER TABLE pipeline_events ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE pipeline_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE pipeline_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- cache (already has updated_at)
ALTER TABLE cache ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE cache ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE cache ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================================================
-- 4. Backfill user_id with a placeholder admin UUID
--    REPLACE '00000000-0000-0000-0000-000000000000' with the real UUID from
--    Authentication → Users before running on production.
-- ============================================================================

DO $$
DECLARE
  admin_uid UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  UPDATE missions          SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE mission_events    SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE todos             SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE agents            SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE user_preferences  SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE ideas             SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE captures          SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE knowledge_entries SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE changelog_entries SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE decisions         SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE daily_reviews     SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE weekly_reviews    SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE retrospectives    SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE habits            SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE habit_entries     SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE workflow_notes    SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE activity_log      SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE pipeline_events   SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE cache             SET user_id = admin_uid WHERE user_id IS NULL;
END $$;

-- ============================================================================
-- 5. Finish user_preferences migration: drop old TEXT column, promote UUID pk
-- ============================================================================

-- Remove the stale 'default' seed row (it has no valid auth.users UUID)
DELETE FROM user_preferences WHERE old_user_id = 'default';

-- Drop the renamed TEXT column — no longer needed
ALTER TABLE user_preferences DROP COLUMN IF EXISTS old_user_id;

-- Promote id to primary key (only if it isn't already the pk)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_preferences'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE user_preferences ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ============================================================================
-- 6. Set user_id NOT NULL on all 19 tables
-- ============================================================================

ALTER TABLE missions          ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE mission_events    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE todos              ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE agents             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE user_preferences   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE ideas               ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE captures            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE knowledge_entries   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE changelog_entries   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE decisions            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE daily_reviews        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE weekly_reviews       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE retrospectives       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE habits                ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE habit_entries         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE workflow_notes        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE activity_log          ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE pipeline_events       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cache                  ALTER COLUMN user_id SET NOT NULL;

-- ============================================================================
-- 7. Add user_id index on every table
-- ============================================================================

CREATE INDEX IF NOT EXISTS missions_user_id_idx          ON missions(user_id);
CREATE INDEX IF NOT EXISTS mission_events_user_id_idx    ON mission_events(user_id);
CREATE INDEX IF NOT EXISTS todos_user_id_idx             ON todos(user_id);
CREATE INDEX IF NOT EXISTS agents_user_id_idx            ON agents(user_id);
CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx  ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS ideas_user_id_idx             ON ideas(user_id);
CREATE INDEX IF NOT EXISTS captures_user_id_idx          ON captures(user_id);
CREATE INDEX IF NOT EXISTS knowledge_entries_user_id_idx ON knowledge_entries(user_id);
CREATE INDEX IF NOT EXISTS changelog_entries_user_id_idx ON changelog_entries(user_id);
CREATE INDEX IF NOT EXISTS decisions_user_id_idx         ON decisions(user_id);
CREATE INDEX IF NOT EXISTS daily_reviews_user_id_idx     ON daily_reviews(user_id);
CREATE INDEX IF NOT EXISTS weekly_reviews_user_id_idx    ON weekly_reviews(user_id);
CREATE INDEX IF NOT EXISTS retrospectives_user_id_idx    ON retrospectives(user_id);
CREATE INDEX IF NOT EXISTS habits_user_id_idx            ON habits(user_id);
CREATE INDEX IF NOT EXISTS habit_entries_user_id_idx     ON habit_entries(user_id);
CREATE INDEX IF NOT EXISTS workflow_notes_user_id_idx    ON workflow_notes(user_id);
CREATE INDEX IF NOT EXISTS activity_log_user_id_idx      ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS pipeline_events_user_id_idx   ON pipeline_events(user_id);
CREATE INDEX IF NOT EXISTS cache_user_id_idx             ON cache(user_id);

-- ============================================================================
-- 8. Handle special unique constraints that must become per-user
-- ============================================================================

-- daily_reviews: was UNIQUE(date), must be UNIQUE(user_id, date)
DROP INDEX IF EXISTS daily_reviews_date_idx;
CREATE UNIQUE INDEX IF NOT EXISTS daily_reviews_user_date_idx
  ON daily_reviews(user_id, date);

-- weekly_reviews: was UNIQUE(week_start), must be UNIQUE(user_id, week_start)
DROP INDEX IF EXISTS weekly_reviews_week_start_idx;
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reviews_user_week_start_idx
  ON weekly_reviews(user_id, week_start);

-- habit_entries: was UNIQUE(habit_id, date), must be UNIQUE(user_id, habit_id, date)
ALTER TABLE habit_entries DROP CONSTRAINT IF EXISTS habit_entries_habit_id_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS habit_entries_user_habit_date_idx
  ON habit_entries(user_id, habit_id, date);

-- ============================================================================
-- 9. Enable RLS on all 19 tables
-- ============================================================================

ALTER TABLE missions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures            ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews       ENABLE ROW LEVEL SECURITY;
ALTER TABLE retrospectives       ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache                  ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. Create user isolation policies on all 19 tables
-- ============================================================================

CREATE POLICY "user isolation" ON missions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON mission_events
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON todos
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON agents
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON user_preferences
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON ideas
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON captures
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON knowledge_entries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON changelog_entries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON decisions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON daily_reviews
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON weekly_reviews
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON retrospectives
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON habits
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON habit_entries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON workflow_notes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON activity_log
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON pipeline_events
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user isolation" ON cache
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 11. updated_at triggers
--     Only create triggers on tables that did NOT already have one.
--     Tables that already had updated_at in the initial schema:
--       missions, todos, agents, decisions, ideas, cache, user_preferences
--     All others need a new trigger.
-- ============================================================================

-- Tables newly receiving updated_at — create triggers for all of them.
-- For the tables that already had the column we also create triggers here
-- because the initial migration did NOT include triggers — it relied on the
-- application layer to set updated_at. Adding triggers is safe and idempotent
-- (we use DROP IF EXISTS before CREATE to guard re-runs).

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'missions', 'mission_events', 'todos', 'agents', 'user_preferences',
    'ideas', 'captures', 'knowledge_entries', 'changelog_entries', 'decisions',
    'daily_reviews', 'weekly_reviews', 'retrospectives', 'habits', 'habit_entries',
    'workflow_notes', 'activity_log', 'pipeline_events', 'cache'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_%I_updated_at ON %I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER set_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- 12. REPLICA IDENTITY FULL on realtime tables (enables DELETE events)
-- ============================================================================

ALTER TABLE missions       REPLICA IDENTITY FULL;
ALTER TABLE mission_events REPLICA IDENTITY FULL;
ALTER TABLE todos           REPLICA IDENTITY FULL;
ALTER TABLE agents          REPLICA IDENTITY FULL;

-- ============================================================================
-- 13. Add ideas and cache to the realtime publication
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ideas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ideas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cache'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cache;
  END IF;
END $$;

-- ============================================================================
-- 14. New table: user_secrets (encrypted per-user service credentials)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_secrets (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  service              TEXT        NOT NULL,
  encrypted_credentials TEXT       NOT NULL,
  nonce                TEXT        NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, service)
);

ALTER TABLE user_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user isolation" ON user_secrets
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_user_secrets_updated_at ON user_secrets;
CREATE TRIGGER set_user_secrets_updated_at
  BEFORE UPDATE ON user_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS user_secrets_user_id_idx ON user_secrets(user_id);

-- ============================================================================
-- 15. New table: user_usage (per-service budget caps and usage counters)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_usage (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  service       TEXT        NOT NULL,
  period        TEXT        NOT NULL,
  request_count INTEGER     NOT NULL DEFAULT 0,
  token_count   INTEGER     NOT NULL DEFAULT 0,
  cost_cents    INTEGER     NOT NULL DEFAULT 0,
  limit_cents   INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, service, period)
);

ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user isolation" ON user_usage
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_user_usage_updated_at ON user_usage;
CREATE TRIGGER set_user_usage_updated_at
  BEFORE UPDATE ON user_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS user_usage_user_id_idx ON user_usage(user_id);

-- ============================================================================
-- 16. New table: chat_audit_log (prompt injection detection records)
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_audit_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  message_role        TEXT        NOT NULL,
  message_text        TEXT        NOT NULL,
  injection_detected  BOOLEAN     DEFAULT FALSE,
  flagged_patterns    TEXT[],
  tokens_used         INTEGER,
  model               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user isolation" ON chat_audit_log
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS chat_audit_log_user_id_idx ON chat_audit_log(user_id);
CREATE INDEX IF NOT EXISTS chat_audit_log_created_at_idx
  ON chat_audit_log(created_at DESC);

-- ============================================================================
-- End of migration
-- ============================================================================

COMMIT;
