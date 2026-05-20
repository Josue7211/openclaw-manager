CREATE TABLE IF NOT EXISTS vault_collaboration_events_next (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    peer_name TEXT NOT NULL,
    peer_seen_at INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('presence', 'leave', 'draft', 'operation', 'cursor')),
    content_markdown TEXT,
    base_checksum TEXT,
    content_checksum TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    FOREIGN KEY(document_id) REFERENCES vault_documents(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO vault_collaboration_events_next (
    id,
    document_id,
    peer_id,
    peer_name,
    peer_seen_at,
    kind,
    content_markdown,
    base_checksum,
    content_checksum,
    metadata_json,
    created_at,
    expires_at
)
SELECT
    id,
    document_id,
    peer_id,
    peer_name,
    peer_seen_at,
    kind,
    content_markdown,
    base_checksum,
    content_checksum,
    '{}',
    created_at,
    expires_at
FROM vault_collaboration_events;

DROP TABLE vault_collaboration_events;

ALTER TABLE vault_collaboration_events_next RENAME TO vault_collaboration_events;

CREATE INDEX IF NOT EXISTS idx_vault_collaboration_document_created
    ON vault_collaboration_events(document_id, created_at);

CREATE INDEX IF NOT EXISTS idx_vault_collaboration_expires
    ON vault_collaboration_events(expires_at);
