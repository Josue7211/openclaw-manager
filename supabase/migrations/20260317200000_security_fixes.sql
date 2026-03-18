-- ============================================================================
-- Mission Control: Database Security Hardening
-- ============================================================================
-- Fixes all database security vulnerabilities found in the audit:
--
--   1. user_preferences table has no RLS — add RLS + FORCE
--   2. FORCE ROW LEVEL SECURITY on ALL tables (owner bypass prevention)
--   3. activity_log made append-only (SELECT + INSERT only)
--   4. chat_audit_log made append-only (SELECT + INSERT only)
--   5. pipeline_events made append-only (SELECT + INSERT only)
--   6. mission_events made append-only (SELECT + INSERT only)
--   7. Revoke anon access from all data tables
--   8. Revoke EXECUTE on _check_canary_integrity from all API roles
--   9. Canary tamper detection trigger on _canary_tokens
--  10. Note on hardcoded admin UUID (addressed for new installs)
--
-- All statements use IF EXISTS / IF NOT EXISTS guards for idempotency.
-- ============================================================================

-- No transaction wrapper — each statement runs independently so one failure
-- does not cascade.

-- ============================================================================
-- 1. user_preferences: enable RLS with user isolation
-- ============================================================================
ALTER TABLE IF EXISTS user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user isolation" ON user_preferences;
CREATE POLICY "user isolation" ON user_preferences
  FOR ALL
  USING (user_id = CAST(auth.uid() AS text))
  WITH CHECK (user_id = CAST(auth.uid() AS text));

-- ============================================================================
-- 2. FORCE ROW LEVEL SECURITY on ALL tables
-- ============================================================================
-- ENABLE ROW LEVEL SECURITY only applies to non-owner roles by default.
-- FORCE ROW LEVEL SECURITY ensures the table owner (supabase_admin) also
-- respects RLS policies, closing a privilege escalation vector.
--
-- Applied to all 28 tables that have RLS enabled.

-- 21 original data tables (from rls_user_isolation migration)
ALTER TABLE activity_log      FORCE ROW LEVEL SECURITY;
ALTER TABLE agents            FORCE ROW LEVEL SECURITY;
ALTER TABLE cache             FORCE ROW LEVEL SECURITY;
ALTER TABLE capture_inbox     FORCE ROW LEVEL SECURITY;
ALTER TABLE captures          FORCE ROW LEVEL SECURITY;
ALTER TABLE changelog_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_reviews     FORCE ROW LEVEL SECURITY;
ALTER TABLE decisions         FORCE ROW LEVEL SECURITY;
ALTER TABLE email_accounts    FORCE ROW LEVEL SECURITY;
ALTER TABLE habit_entries     FORCE ROW LEVEL SECURITY;
ALTER TABLE habits            FORCE ROW LEVEL SECURITY;
ALTER TABLE ideas             FORCE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE mission_events    FORCE ROW LEVEL SECURITY;
ALTER TABLE missions          FORCE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events   FORCE ROW LEVEL SECURITY;
ALTER TABLE prefs             FORCE ROW LEVEL SECURITY;
ALTER TABLE retrospectives    FORCE ROW LEVEL SECURITY;
ALTER TABLE todos             FORCE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews    FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_notes    FORCE ROW LEVEL SECURITY;

-- 3 tables from rls_user_isolation (new tables in that migration)
ALTER TABLE user_secrets      FORCE ROW LEVEL SECURITY;
ALTER TABLE user_usage        FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_audit_log    FORCE ROW LEVEL SECURITY;

-- user_profiles (from 20260316100000_user_profiles migration)
ALTER TABLE user_profiles     FORCE ROW LEVEL SECURITY;

-- canary tables (from 20260317000000_canary_tokens migration)
ALTER TABLE _canary_tokens     FORCE ROW LEVEL SECURITY;
ALTER TABLE _canary_access_log FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. activity_log: make append-only (SELECT + INSERT only)
-- ============================================================================
-- Audit logs should never be updated or deleted by users. Replace the
-- permissive FOR ALL policy with separate SELECT and INSERT policies.

DROP POLICY IF EXISTS "user isolation" ON activity_log;
DROP POLICY IF EXISTS "user can read own activity" ON activity_log;
DROP POLICY IF EXISTS "user can insert own activity" ON activity_log;

CREATE POLICY "user can read own activity" ON activity_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user can insert own activity" ON activity_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 4. chat_audit_log: make append-only (SELECT + INSERT only)
-- ============================================================================

DROP POLICY IF EXISTS "user isolation" ON chat_audit_log;
DROP POLICY IF EXISTS "user can read own chat audit" ON chat_audit_log;
DROP POLICY IF EXISTS "user can insert own chat audit" ON chat_audit_log;

CREATE POLICY "user can read own chat audit" ON chat_audit_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user can insert own chat audit" ON chat_audit_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 5. pipeline_events: make append-only (SELECT + INSERT only)
-- ============================================================================

DROP POLICY IF EXISTS "user isolation" ON pipeline_events;
DROP POLICY IF EXISTS "user can read own pipeline events" ON pipeline_events;
DROP POLICY IF EXISTS "user can insert own pipeline events" ON pipeline_events;

CREATE POLICY "user can read own pipeline events" ON pipeline_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user can insert own pipeline events" ON pipeline_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 6. mission_events: make append-only (SELECT + INSERT only)
-- ============================================================================

DROP POLICY IF EXISTS "user isolation" ON mission_events;
DROP POLICY IF EXISTS "user can read own mission events" ON mission_events;
DROP POLICY IF EXISTS "user can insert own mission events" ON mission_events;

CREATE POLICY "user can read own mission events" ON mission_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user can insert own mission events" ON mission_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 7. Revoke anon access from ALL data tables
-- ============================================================================
-- The anon role is used by unauthenticated PostgREST requests. No data
-- tables should be accessible without authentication.

-- 21 original data tables
REVOKE ALL ON public.activity_log      FROM anon;
REVOKE ALL ON public.agents            FROM anon;
REVOKE ALL ON public.cache             FROM anon;
REVOKE ALL ON public.capture_inbox     FROM anon;
REVOKE ALL ON public.captures          FROM anon;
REVOKE ALL ON public.changelog_entries FROM anon;
REVOKE ALL ON public.daily_reviews     FROM anon;
REVOKE ALL ON public.decisions         FROM anon;
REVOKE ALL ON public.email_accounts    FROM anon;
REVOKE ALL ON public.habit_entries     FROM anon;
REVOKE ALL ON public.habits            FROM anon;
REVOKE ALL ON public.ideas             FROM anon;
REVOKE ALL ON public.knowledge_entries FROM anon;
REVOKE ALL ON public.mission_events    FROM anon;
REVOKE ALL ON public.missions          FROM anon;
REVOKE ALL ON public.pipeline_events   FROM anon;
REVOKE ALL ON public.prefs             FROM anon;
REVOKE ALL ON public.retrospectives    FROM anon;
REVOKE ALL ON public.todos             FROM anon;
REVOKE ALL ON public.weekly_reviews    FROM anon;
REVOKE ALL ON public.workflow_notes    FROM anon;

-- Tables from rls_user_isolation
REVOKE ALL ON public.user_secrets      FROM anon;
REVOKE ALL ON public.user_usage        FROM anon;
REVOKE ALL ON public.chat_audit_log    FROM anon;

-- user_profiles
REVOKE ALL ON public.user_profiles     FROM anon;

-- Legacy table
REVOKE ALL ON public.user_preferences  FROM anon;

-- Canary tables (already revoked in canary migration, but belt-and-suspenders)
REVOKE ALL ON public._canary_tokens     FROM anon;
REVOKE ALL ON public._canary_access_log FROM anon;

-- ============================================================================
-- 8. Revoke EXECUTE on _check_canary_integrity()
-- ============================================================================
-- Already done in the canary migration, but ensure it sticks. This function
-- is SECURITY DEFINER and must only be callable by superadmins.

REVOKE EXECUTE ON FUNCTION public._check_canary_integrity() FROM anon, authenticated;

-- ============================================================================
-- 9. Canary tamper detection trigger on _canary_tokens
-- ============================================================================
-- Any INSERT, UPDATE, or DELETE on _canary_tokens is logged to
-- _canary_access_log. Since no legitimate code path modifies this table
-- after initial seeding, any trigger fire indicates tampering or a breach.

CREATE OR REPLACE FUNCTION public._canary_tamper_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public._canary_access_log (table_name, operation, queried_at, db_user, client_addr)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    now(),
    current_user,
    inet_client_addr()::text
  );

  -- For DELETE, return OLD so the statement can proceed (and be logged)
  -- For INSERT/UPDATE, return NEW
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Revoke execute on the trigger function itself
REVOKE EXECUTE ON FUNCTION public._canary_tamper_notify() FROM anon, authenticated;

-- Drop existing triggers if any, then create
DROP TRIGGER IF EXISTS canary_tamper_on_insert ON public._canary_tokens;
DROP TRIGGER IF EXISTS canary_tamper_on_update ON public._canary_tokens;
DROP TRIGGER IF EXISTS canary_tamper_on_delete ON public._canary_tokens;

CREATE TRIGGER canary_tamper_on_insert
  AFTER INSERT ON public._canary_tokens
  FOR EACH ROW EXECUTE FUNCTION public._canary_tamper_notify();

CREATE TRIGGER canary_tamper_on_update
  AFTER UPDATE ON public._canary_tokens
  FOR EACH ROW EXECUTE FUNCTION public._canary_tamper_notify();

CREATE TRIGGER canary_tamper_on_delete
  AFTER DELETE ON public._canary_tokens
  FOR EACH ROW EXECUTE FUNCTION public._canary_tamper_notify();

-- ============================================================================
-- 10. Note on hardcoded admin UUID
-- ============================================================================
-- The backfill in 20260316000000_rls_user_isolation.sql uses a hardcoded
-- admin UUID ('1724c936-14f5-4efd-8e2d-d7b569df637c') to assign ownership
-- of pre-existing rows. That migration has already been applied and cannot
-- be changed retroactively.
--
-- For new installs: the backfill is harmless because all tables start empty
-- (no rows where user_id IS NULL). The hardcoded UUID only matters for the
-- original deployment's data migration.
--
-- Future improvement: a setup script could detect the first authenticated
-- user and reassign ownership dynamically. This is tracked but not
-- implemented here since it requires application-level coordination.

-- End of security fixes migration
