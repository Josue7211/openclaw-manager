-- Bjorn Module Builder: AI-generated dashboard modules.
-- Modules are created by Bjorn, versioned, and soft-deletable.

CREATE TABLE IF NOT EXISTS bjorn_modules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'Cube',
    source TEXT NOT NULL,
    config_schema TEXT DEFAULT '{}',
    default_size_w INTEGER NOT NULL DEFAULT 3,
    default_size_h INTEGER NOT NULL DEFAULT 3,
    version INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS bjorn_module_versions (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL REFERENCES bjorn_modules(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    source TEXT NOT NULL,
    config_schema TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(module_id, version)
);

CREATE INDEX IF NOT EXISTS idx_bjorn_modules_user ON bjorn_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_bjorn_modules_enabled ON bjorn_modules(enabled);
CREATE INDEX IF NOT EXISTS idx_bjorn_versions_module ON bjorn_module_versions(module_id);
