CREATE TABLE IF NOT EXISTS module_proposals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    user_intent TEXT NOT NULL DEFAULT '',
    target_type TEXT NOT NULL,
    install_target TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'custom',
    status TEXT NOT NULL DEFAULT 'draft',
    proposal_json TEXT NOT NULL,
    backend_contract_requested INTEGER NOT NULL DEFAULT 0,
    backend_contract_summary TEXT NOT NULL DEFAULT '',
    backend_contract_json TEXT NOT NULL DEFAULT '{}',
    source_model TEXT,
    generator TEXT,
    installed_module_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_module_proposals_user ON module_proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_module_proposals_status ON module_proposals(status);
