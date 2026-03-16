-- ============================================================================
-- Mission Control: RLS User Isolation
-- ============================================================================
-- Adds user_id, updated_at, deleted_at to all 21 public tables.
-- Enables Row Level Security with per-user isolation policies.
-- Creates user_secrets, user_usage, and chat_audit_log tables.
--
-- Targets the ACTUAL remote schema (21 tables):
--   activity_log, agents, cache, capture_inbox, captures, changelog_entries,
--   daily_reviews, decisions, email_accounts, habit_entries, habits, ideas,
--   knowledge_entries, mission_events, missions, pipeline_events, prefs,
--   retrospectives, todos, weekly_reviews, workflow_notes
--
-- NO transaction wrapper — each statement runs independently so one failure
-- does not cascade. Uses IF NOT EXISTS / IF EXISTS guards for re-runnability.
-- ============================================================================

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
-- 2. Add user_id, updated_at (where missing), deleted_at to all 21 tables
-- ============================================================================

-- activity_log (NO updated_at)
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- agents (HAS updated_at)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- cache (HAS updated_at)
ALTER TABLE cache ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE cache ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- capture_inbox (HAS updated_at)
ALTER TABLE capture_inbox ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE capture_inbox ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- captures (NO updated_at)
ALTER TABLE captures ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE captures ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- changelog_entries (HAS updated_at)
ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- daily_reviews (HAS updated_at)
ALTER TABLE daily_reviews ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE daily_reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- decisions (HAS updated_at)
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- email_accounts (HAS updated_at)
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- habit_entries (NO updated_at)
ALTER TABLE habit_entries ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE habit_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE habit_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- habits (NO updated_at)
ALTER TABLE habits ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE habits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ideas (HAS updated_at)
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- knowledge_entries (HAS updated_at)
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- mission_events (NO updated_at)
ALTER TABLE mission_events ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE mission_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE mission_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- missions (HAS updated_at)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- pipeline_events (NO updated_at)
ALTER TABLE pipeline_events ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE pipeline_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE pipeline_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- prefs (HAS updated_at, key TEXT with UNIQUE constraint — no PK)
ALTER TABLE prefs ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE prefs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- retrospectives (HAS updated_at)
ALTER TABLE retrospectives ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE retrospectives ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- todos (HAS updated_at)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- weekly_reviews (HAS updated_at)
ALTER TABLE weekly_reviews ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE weekly_reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- workflow_notes (HAS updated_at)
ALTER TABLE workflow_notes ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE workflow_notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================================================
-- 3. Backfill user_id on all 21 tables
-- ============================================================================

DO $$
DECLARE
  admin_uid UUID := '1724c936-14f5-4efd-8e2d-d7b569df637c';
BEGIN
  UPDATE activity_log      SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE agents            SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE cache             SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE capture_inbox     SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE captures          SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE changelog_entries SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE daily_reviews     SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE decisions         SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE email_accounts    SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE habit_entries     SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE habits            SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE ideas             SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE knowledge_entries SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE mission_events    SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE missions          SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE pipeline_events   SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE prefs             SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE retrospectives    SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE todos             SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE weekly_reviews    SET user_id = admin_uid WHERE user_id IS NULL;
  UPDATE workflow_notes    SET user_id = admin_uid WHERE user_id IS NULL;
END $$;

-- ============================================================================
-- 4. Set user_id NOT NULL on all 21 tables
-- ============================================================================

ALTER TABLE activity_log      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE agents            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cache             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE capture_inbox     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE captures          ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE changelog_entries ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE daily_reviews     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE decisions         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE email_accounts    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE habit_entries     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE habits            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE ideas             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE knowledge_entries ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE mission_events    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE missions          ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE pipeline_events   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE prefs             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE retrospectives    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE todos             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE weekly_reviews    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE workflow_notes    ALTER COLUMN user_id SET NOT NULL;

-- ============================================================================
-- 5. Add user_id indexes on all 21 tables
-- ============================================================================

CREATE INDEX IF NOT EXISTS activity_log_user_id_idx      ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS agents_user_id_idx            ON agents(user_id);
CREATE INDEX IF NOT EXISTS cache_user_id_idx             ON cache(user_id);
CREATE INDEX IF NOT EXISTS capture_inbox_user_id_idx     ON capture_inbox(user_id);
CREATE INDEX IF NOT EXISTS captures_user_id_idx          ON captures(user_id);
CREATE INDEX IF NOT EXISTS changelog_entries_user_id_idx ON changelog_entries(user_id);
CREATE INDEX IF NOT EXISTS daily_reviews_user_id_idx     ON daily_reviews(user_id);
CREATE INDEX IF NOT EXISTS decisions_user_id_idx         ON decisions(user_id);
CREATE INDEX IF NOT EXISTS email_accounts_user_id_idx    ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS habit_entries_user_id_idx     ON habit_entries(user_id);
CREATE INDEX IF NOT EXISTS habits_user_id_idx            ON habits(user_id);
CREATE INDEX IF NOT EXISTS ideas_user_id_idx             ON ideas(user_id);
CREATE INDEX IF NOT EXISTS knowledge_entries_user_id_idx ON knowledge_entries(user_id);
CREATE INDEX IF NOT EXISTS mission_events_user_id_idx    ON mission_events(user_id);
CREATE INDEX IF NOT EXISTS missions_user_id_idx          ON missions(user_id);
CREATE INDEX IF NOT EXISTS pipeline_events_user_id_idx   ON pipeline_events(user_id);
CREATE INDEX IF NOT EXISTS prefs_user_id_idx             ON prefs(user_id);
CREATE INDEX IF NOT EXISTS retrospectives_user_id_idx    ON retrospectives(user_id);
CREATE INDEX IF NOT EXISTS todos_user_id_idx             ON todos(user_id);
CREATE INDEX IF NOT EXISTS weekly_reviews_user_id_idx    ON weekly_reviews(user_id);
CREATE INDEX IF NOT EXISTS workflow_notes_user_id_idx    ON workflow_notes(user_id);

-- ============================================================================
-- 6. Handle special unique constraints that must become per-user
-- ============================================================================

-- prefs: was UNIQUE(key), must be UNIQUE(user_id, key)
DO $$ BEGIN
  ALTER TABLE prefs DROP CONSTRAINT IF EXISTS prefs_key_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS prefs_user_key_idx ON prefs(user_id, key);

-- daily_reviews: was UNIQUE(date), must be UNIQUE(user_id, date)
DO $$ BEGIN
  ALTER TABLE daily_reviews DROP CONSTRAINT IF EXISTS daily_reviews_date_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS daily_reviews_user_date_idx ON daily_reviews(user_id, date);

-- weekly_reviews: was UNIQUE(week_start), must be UNIQUE(user_id, week_start)
DO $$ BEGIN
  ALTER TABLE weekly_reviews DROP CONSTRAINT IF EXISTS weekly_reviews_week_start_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reviews_user_week_start_idx ON weekly_reviews(user_id, week_start);

-- habit_entries: was UNIQUE(habit_id, date), must be UNIQUE(user_id, habit_id, date)
DO $$ BEGIN
  ALTER TABLE habit_entries DROP CONSTRAINT IF EXISTS habit_entries_habit_id_date_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS habit_entries_user_habit_date_idx ON habit_entries(user_id, habit_id, date);

-- ============================================================================
-- 7. Enable RLS on all 21 tables
-- ============================================================================

ALTER TABLE activity_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache             ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_inbox     ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures          ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prefs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE retrospectives    ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notes    ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. Create user isolation policies on all 21 tables
--    DROP IF EXISTS first so this is re-runnable.
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'activity_log', 'agents', 'cache', 'capture_inbox', 'captures',
    'changelog_entries', 'daily_reviews', 'decisions', 'email_accounts',
    'habit_entries', 'habits', 'ideas', 'knowledge_entries', 'mission_events',
    'missions', 'pipeline_events', 'prefs', 'retrospectives', 'todos',
    'weekly_reviews', 'workflow_notes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "user isolation" ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY "user isolation" ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- 9. updated_at triggers on all 21 tables
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'activity_log', 'agents', 'cache', 'capture_inbox', 'captures',
    'changelog_entries', 'daily_reviews', 'decisions', 'email_accounts',
    'habit_entries', 'habits', 'ideas', 'knowledge_entries', 'mission_events',
    'missions', 'pipeline_events', 'prefs', 'retrospectives', 'todos',
    'weekly_reviews', 'workflow_notes'
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
-- 10. REPLICA IDENTITY FULL on realtime tables (enables DELETE events)
-- ============================================================================

ALTER TABLE missions       REPLICA IDENTITY FULL;
ALTER TABLE mission_events REPLICA IDENTITY FULL;
ALTER TABLE todos          REPLICA IDENTITY FULL;
ALTER TABLE agents         REPLICA IDENTITY FULL;

-- ============================================================================
-- 11. Add ideas and cache to the realtime publication (if not already there)
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
-- 12. New table: user_secrets (encrypted per-user service credentials)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_secrets (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  service               TEXT        NOT NULL,
  encrypted_credentials TEXT        NOT NULL,
  nonce                 TEXT        NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, service)
);

ALTER TABLE user_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user isolation" ON user_secrets;
CREATE POLICY "user isolation" ON user_secrets
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_user_secrets_updated_at ON user_secrets;
CREATE TRIGGER set_user_secrets_updated_at
  BEFORE UPDATE ON user_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS user_secrets_user_id_idx ON user_secrets(user_id);

-- ============================================================================
-- 13. New table: user_usage (per-service budget caps and usage counters)
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

DROP POLICY IF EXISTS "user isolation" ON user_usage;
CREATE POLICY "user isolation" ON user_usage
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_user_usage_updated_at ON user_usage;
CREATE TRIGGER set_user_usage_updated_at
  BEFORE UPDATE ON user_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS user_usage_user_id_idx ON user_usage(user_id);

-- ============================================================================
-- 14. New table: chat_audit_log (prompt injection detection records)
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

DROP POLICY IF EXISTS "user isolation" ON chat_audit_log;
CREATE POLICY "user isolation" ON chat_audit_log
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS chat_audit_log_user_id_idx ON chat_audit_log(user_id);
CREATE INDEX IF NOT EXISTS chat_audit_log_created_at_idx
  ON chat_audit_log(created_at DESC);

-- ============================================================================
-- End of migration
-- ============================================================================
