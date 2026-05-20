CREATE TABLE IF NOT EXISTS career_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    lanes TEXT NOT NULL DEFAULT '[]',
    pay_floors TEXT NOT NULL DEFAULT '{}',
    locations TEXT NOT NULL DEFAULT '[]',
    strengths TEXT NOT NULL DEFAULT '[]',
    resume_packet TEXT NOT NULL DEFAULT '{}',
    links TEXT NOT NULL DEFAULT '{}',
    availability TEXT NOT NULL DEFAULT 'flexible ASAP',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_career_profiles_user_active
    ON career_profiles(user_id)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS career_dossiers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    lane TEXT NOT NULL DEFAULT 'cash-now' CHECK (lane IN ('cash-now', 'engineering', 'trainer')),
    stage TEXT NOT NULL DEFAULT 'sourcing' CHECK (stage IN ('sourcing', 'applied', 'interviewing', 'offer', 'archived')),
    source TEXT NOT NULL DEFAULT '{}',
    source_url TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    recommendation TEXT NOT NULL DEFAULT 'hold',
    next_action TEXT NOT NULL DEFAULT 'Apply today',
    due TEXT NOT NULL DEFAULT 'Today',
    salary_text TEXT NOT NULL DEFAULT '',
    estimated_hourly_rate REAL,
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    evaluation TEXT NOT NULL DEFAULT '{}',
    assets TEXT NOT NULL DEFAULT '{}',
    timeline TEXT NOT NULL DEFAULT '[]',
    fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_career_dossiers_user_fingerprint_active
    ON career_dossiers(user_id, fingerprint)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_career_dossiers_user_lane_stage
    ON career_dossiers(user_id, lane, stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS career_applications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dossier_id TEXT NOT NULL,
    batch_id TEXT,
    status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'queued_for_browser_submit', 'submitted', 'blocked', 'failed')),
    submit_mode TEXT NOT NULL DEFAULT 'browser-assisted',
    prepared_answers TEXT NOT NULL DEFAULT '{}',
    packet_snapshot TEXT NOT NULL DEFAULT '{}',
    required_fields TEXT NOT NULL DEFAULT '[]',
    risk_flags TEXT NOT NULL DEFAULT '[]',
    audit TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY(dossier_id) REFERENCES career_dossiers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_career_applications_user_status
    ON career_applications(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_applications_batch
    ON career_applications(user_id, batch_id);

CREATE TABLE IF NOT EXISTS career_saved_searches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    lane TEXT NOT NULL DEFAULT 'cash-now' CHECK (lane IN ('cash-now', 'engineering', 'trainer')),
    source_set TEXT NOT NULL DEFAULT '[]',
    schedule TEXT NOT NULL DEFAULT '{}',
    filters TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_career_saved_searches_user_lane
    ON career_saved_searches(user_id, lane, updated_at DESC);

CREATE TABLE IF NOT EXISTS career_outcomes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dossier_id TEXT,
    application_id TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('callback', 'rejection', 'interview', 'offer', 'ignored')),
    callback_quality TEXT,
    pay TEXT,
    lesson TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY(dossier_id) REFERENCES career_dossiers(id) ON DELETE SET NULL,
    FOREIGN KEY(application_id) REFERENCES career_applications(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_career_outcomes_user_created
    ON career_outcomes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS career_search_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    lane TEXT NOT NULL DEFAULT 'cash-now' CHECK (lane IN ('cash-now', 'engineering', 'trainer')),
    query TEXT NOT NULL,
    source_set TEXT NOT NULL DEFAULT '[]',
    filters TEXT NOT NULL DEFAULT '{}',
    result_count INTEGER NOT NULL DEFAULT 0,
    dedupe_fingerprints TEXT NOT NULL DEFAULT '[]',
    created_dossier_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_career_search_runs_user_created
    ON career_search_runs(user_id, created_at DESC);
