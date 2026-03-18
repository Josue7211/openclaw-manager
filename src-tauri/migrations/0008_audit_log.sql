-- Immutable audit log for tracking security-sensitive mutations.
-- Entries are append-only; no UPDATE or DELETE should ever run against this table.
-- Replaces the old audit_log from 0001_init.sql (which had different columns).

DROP TABLE IF EXISTS audit_log;

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,         -- create, update, delete, read, export, logout
    resource_type TEXT NOT NULL,  -- todos, missions, ideas, secrets, session, etc.
    resource_id TEXT,
    details TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
