CREATE TABLE IF NOT EXISTS vault_documents (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'note',
    content_markdown TEXT NOT NULL DEFAULT '',
    content_json TEXT,
    folder_path TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    links_json TEXT NOT NULL DEFAULT '[]',
    aliases_json TEXT NOT NULL DEFAULT '[]',
    properties_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    trashed_at INTEGER,
    trash_origin_path TEXT,
    deleted_at INTEGER,
    checksum TEXT NOT NULL DEFAULT '',
    schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_documents_live_path
    ON vault_documents(path)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vault_documents_folder
    ON vault_documents(folder_path, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vault_documents_deleted
    ON vault_documents(deleted_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS vault_folders (
    path TEXT PRIMARY KEY,
    parent_path TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    trashed_at INTEGER,
    trash_origin_path TEXT,
    deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_vault_folders_parent
    ON vault_folders(parent_path, name)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS vault_attachments (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    path TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '',
    storage_path TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY(document_id) REFERENCES vault_documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_attachments_document
    ON vault_attachments(document_id)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS vault_versions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    label TEXT,
    content_markdown TEXT NOT NULL DEFAULT '',
    content_json TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'local',
    reason TEXT NOT NULL DEFAULT 'autosave',
    checksum TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(document_id) REFERENCES vault_documents(id) ON DELETE CASCADE,
    UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_vault_versions_document
    ON vault_versions(document_id, version_number DESC);

CREATE TABLE IF NOT EXISTS vault_comments (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    anchor_json TEXT NOT NULL DEFAULT '{}',
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    resolved_at INTEGER,
    FOREIGN KEY(document_id) REFERENCES vault_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vault_comments_document
    ON vault_comments(document_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS vault_suggestions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    anchor_json TEXT NOT NULL DEFAULT '{}',
    patch_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    applied_at INTEGER,
    FOREIGN KEY(document_id) REFERENCES vault_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vault_suggestions_document
    ON vault_suggestions(document_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS vault_save_queue (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    FOREIGN KEY(document_id) REFERENCES vault_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vault_save_queue_created
    ON vault_save_queue(created_at);

CREATE TABLE IF NOT EXISTS vault_sync_state (
    provider TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    local_id TEXT NOT NULL,
    remote_rev TEXT,
    last_synced_at INTEGER,
    conflict_state TEXT NOT NULL DEFAULT 'clean',
    conflict_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY(provider, remote_id),
    FOREIGN KEY(local_id) REFERENCES vault_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vault_sync_state_local
    ON vault_sync_state(local_id);

CREATE TABLE IF NOT EXISTS vault_audit_log (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    action TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_audit_log_document
    ON vault_audit_log(document_id, created_at DESC);
