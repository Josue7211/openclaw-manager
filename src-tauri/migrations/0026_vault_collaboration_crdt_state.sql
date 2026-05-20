CREATE TABLE IF NOT EXISTS vault_collaboration_crdt_state (
    document_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    checksum TEXT NOT NULL,
    client_id TEXT,
    sequence INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(document_id) REFERENCES vault_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vault_collaboration_crdt_state_updated
    ON vault_collaboration_crdt_state(updated_at);
