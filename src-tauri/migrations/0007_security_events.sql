CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,  -- login_success, login_failed, mfa_verified, mfa_failed, mfa_unenroll, password_change, logout, suspicious_activity, signup_attempt, oauth_login
    user_id TEXT,
    ip TEXT DEFAULT '127.0.0.1',
    details TEXT DEFAULT '{}',  -- JSON with extra context
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);
