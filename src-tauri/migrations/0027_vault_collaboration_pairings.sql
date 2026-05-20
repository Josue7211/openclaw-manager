CREATE TABLE IF NOT EXISTS vault_collaboration_pairings (
    id TEXT PRIMARY KEY,
    pairing_key_hash TEXT NOT NULL UNIQUE,
    device_label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved', 'revoked')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    approved_at INTEGER,
    revoked_at INTEGER,
    last_seen_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_vault_collaboration_pairings_status
    ON vault_collaboration_pairings(status, revoked_at);

