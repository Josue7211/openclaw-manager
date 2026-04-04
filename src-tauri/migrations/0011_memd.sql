CREATE TABLE IF NOT EXISTS memd_scopes (
    id          TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    scope_kind  TEXT NOT NULL,
    scope_name  TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (id, user_id),
    UNIQUE (user_id, scope_kind, scope_name)
);

CREATE INDEX IF NOT EXISTS idx_memd_scopes_user_updated_at
    ON memd_scopes (user_id, updated_at);

CREATE TABLE IF NOT EXISTS memd_entries (
    id             TEXT NOT NULL,
    user_id        TEXT NOT NULL,
    scope_id       TEXT NOT NULL,
    kind           TEXT NOT NULL,
    title          TEXT NOT NULL,
    content        TEXT NOT NULL DEFAULT '',
    summary        TEXT NOT NULL DEFAULT '',
    source         TEXT NOT NULL,
    confidence     INTEGER NOT NULL DEFAULT 50,
    priority       INTEGER NOT NULL DEFAULT 0,
    retention_days INTEGER NOT NULL DEFAULT 30,
    version        INTEGER NOT NULL DEFAULT 1,
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    metadata       TEXT NOT NULL DEFAULT '{}',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    archived_at    TEXT,
    PRIMARY KEY (id, user_id),
    FOREIGN KEY (scope_id, user_id) REFERENCES memd_scopes (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memd_entries_user_scope_status_updated_at
    ON memd_entries (user_id, scope_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_memd_entries_user_status_priority_updated_at
    ON memd_entries (user_id, status, priority, updated_at);

CREATE INDEX IF NOT EXISTS idx_memd_entries_user_updated_at
    ON memd_entries (user_id, updated_at);

CREATE TABLE IF NOT EXISTS memd_audit (
    id         TEXT PRIMARY KEY NOT NULL,
    user_id    TEXT NOT NULL,
    action     TEXT NOT NULL,
    scope_id   TEXT,
    entry_id   TEXT,
    details    TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memd_audit_user_created_at
    ON memd_audit (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_memd_audit_user_scope_created_at
    ON memd_audit (user_id, scope_id, created_at);

