-- Rename legacy Bjorn module tables/policies to generated_modules.

ALTER TABLE bjorn_modules RENAME TO generated_modules;
ALTER TABLE bjorn_module_versions RENAME TO generated_module_versions;

DROP POLICY IF EXISTS bjorn_modules_select ON generated_modules;
DROP POLICY IF EXISTS bjorn_modules_insert ON generated_modules;
DROP POLICY IF EXISTS bjorn_modules_update ON generated_modules;
DROP POLICY IF EXISTS bjorn_modules_delete ON generated_modules;
DROP POLICY IF EXISTS bjorn_versions_select ON generated_module_versions;
DROP POLICY IF EXISTS bjorn_versions_insert ON generated_module_versions;
DROP POLICY IF EXISTS bjorn_versions_delete ON generated_module_versions;

DROP INDEX IF EXISTS idx_bjorn_modules_user;
DROP INDEX IF EXISTS idx_bjorn_modules_enabled;
DROP INDEX IF EXISTS idx_bjorn_versions_module;

CREATE INDEX IF NOT EXISTS idx_generated_modules_user ON generated_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_modules_enabled ON generated_modules(enabled);
CREATE INDEX IF NOT EXISTS idx_generated_versions_module ON generated_module_versions(module_id);

CREATE POLICY generated_modules_select ON generated_modules FOR SELECT USING (user_id = auth.uid());
CREATE POLICY generated_modules_insert ON generated_modules FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY generated_modules_update ON generated_modules FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY generated_modules_delete ON generated_modules FOR DELETE USING (user_id = auth.uid());

CREATE POLICY generated_versions_select ON generated_module_versions FOR SELECT
    USING (module_id IN (SELECT id FROM generated_modules WHERE user_id = auth.uid()));
CREATE POLICY generated_versions_insert ON generated_module_versions FOR INSERT
    WITH CHECK (module_id IN (SELECT id FROM generated_modules WHERE user_id = auth.uid()));
CREATE POLICY generated_versions_delete ON generated_module_versions FOR DELETE
    USING (module_id IN (SELECT id FROM generated_modules WHERE user_id = auth.uid()));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bjorn_modules'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE bjorn_modules;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'generated_modules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE generated_modules;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'generated_module_versions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE generated_module_versions;
  END IF;
END $$;
