-- Bjorn Module Builder: AI-generated dashboard modules (Supabase mirror).
-- Mirrors the SQLite schema from 0009_bjorn_modules.sql for cross-device sync.

CREATE TABLE IF NOT EXISTS bjorn_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'Cube',
    source TEXT NOT NULL,
    config_schema JSONB DEFAULT '{}',
    default_size_w INTEGER NOT NULL DEFAULT 3,
    default_size_h INTEGER NOT NULL DEFAULT 3,
    version INTEGER NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bjorn_module_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES bjorn_modules(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    source TEXT NOT NULL,
    config_schema JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(module_id, version)
);

CREATE INDEX IF NOT EXISTS idx_bjorn_modules_user ON bjorn_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_bjorn_modules_enabled ON bjorn_modules(enabled);
CREATE INDEX IF NOT EXISTS idx_bjorn_versions_module ON bjorn_module_versions(module_id);

-- RLS
ALTER TABLE bjorn_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bjorn_module_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE bjorn_modules FORCE ROW LEVEL SECURITY;
ALTER TABLE bjorn_module_versions FORCE ROW LEVEL SECURITY;

-- Policies: users can only access their own modules
CREATE POLICY bjorn_modules_select ON bjorn_modules FOR SELECT USING (user_id = auth.uid());
CREATE POLICY bjorn_modules_insert ON bjorn_modules FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY bjorn_modules_update ON bjorn_modules FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY bjorn_modules_delete ON bjorn_modules FOR DELETE USING (user_id = auth.uid());

-- Version policies: access through module ownership
CREATE POLICY bjorn_versions_select ON bjorn_module_versions FOR SELECT
    USING (module_id IN (SELECT id FROM bjorn_modules WHERE user_id = auth.uid()));
CREATE POLICY bjorn_versions_insert ON bjorn_module_versions FOR INSERT
    WITH CHECK (module_id IN (SELECT id FROM bjorn_modules WHERE user_id = auth.uid()));
CREATE POLICY bjorn_versions_delete ON bjorn_module_versions FOR DELETE
    USING (module_id IN (SELECT id FROM bjorn_modules WHERE user_id = auth.uid()));

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE bjorn_modules;
