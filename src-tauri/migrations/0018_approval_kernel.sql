-- Approval kernel for ClawControl-native approvals and scoped capability grants.
-- This is the durable foundation for Agent Shell, Agent Secrets, mobile, and
-- iMessage approval flows.

CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'clawcontrol',
    requester TEXT NOT NULL DEFAULT '{}',
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '{}',
    risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
    scope TEXT NOT NULL DEFAULT '{}',
    summary TEXT NOT NULL,
    diff TEXT NOT NULL DEFAULT '{}',
    policy TEXT NOT NULL DEFAULT '{}',
    nonce_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'consumed', 'failed')),
    expires_at TEXT NOT NULL,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    resolved_by TEXT,
    resolution_reason TEXT,
    raw TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_user_status_requested
    ON approval_requests(user_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_expires_at
    ON approval_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_source
    ON approval_requests(source);
CREATE INDEX IF NOT EXISTS idx_approval_requests_action
    ON approval_requests(action);

CREATE TABLE IF NOT EXISTS capability_grants (
    id TEXT PRIMARY KEY,
    approval_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '{}',
    scope TEXT NOT NULL DEFAULT '{}',
    risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'consumed', 'revoked', 'expired')),
    issued_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    consumed_by TEXT,
    result_summary TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (approval_id) REFERENCES approval_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_capability_grants_approval
    ON capability_grants(approval_id);
CREATE INDEX IF NOT EXISTS idx_capability_grants_user_status
    ON capability_grants(user_id, status);
CREATE INDEX IF NOT EXISTS idx_capability_grants_expires_at
    ON capability_grants(expires_at);

CREATE TABLE IF NOT EXISTS approval_audit_events (
    id TEXT PRIMARY KEY,
    approval_id TEXT,
    capability_id TEXT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT '{}',
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (approval_id) REFERENCES approval_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (capability_id) REFERENCES capability_grants(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_audit_events_approval
    ON approval_audit_events(approval_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_events_capability
    ON approval_audit_events(capability_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_events_user_created
    ON approval_audit_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_audit_events_type
    ON approval_audit_events(event_type);
