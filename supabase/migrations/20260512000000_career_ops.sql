CREATE TABLE IF NOT EXISTS career_profiles (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lanes JSONB NOT NULL DEFAULT '[]'::jsonb,
    pay_floors JSONB NOT NULL DEFAULT '{}'::jsonb,
    locations JSONB NOT NULL DEFAULT '[]'::jsonb,
    strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
    resume_packet JSONB NOT NULL DEFAULT '{}'::jsonb,
    links JSONB NOT NULL DEFAULT '{}'::jsonb,
    availability TEXT NOT NULL DEFAULT 'flexible ASAP',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_career_profiles_user_active
    ON career_profiles(user_id)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS career_dossiers (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    lane TEXT NOT NULL DEFAULT 'cash-now' CHECK (lane IN ('cash-now', 'engineering', 'trainer')),
    stage TEXT NOT NULL DEFAULT 'sourcing' CHECK (stage IN ('sourcing', 'applied', 'interviewing', 'offer', 'archived')),
    source JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_url TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    recommendation TEXT NOT NULL DEFAULT 'hold',
    next_action TEXT NOT NULL DEFAULT 'Apply today',
    due TEXT NOT NULL DEFAULT 'Today',
    salary_text TEXT NOT NULL DEFAULT '',
    estimated_hourly_rate DOUBLE PRECISION,
    summary TEXT NOT NULL DEFAULT '',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
    assets JSONB NOT NULL DEFAULT '{}'::jsonb,
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_career_dossiers_user_fingerprint_active
    ON career_dossiers(user_id, fingerprint)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_career_dossiers_user_lane_stage
    ON career_dossiers(user_id, lane, stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS career_applications (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES career_dossiers(id) ON DELETE CASCADE,
    batch_id TEXT,
    status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'queued_for_browser_submit', 'submitted', 'blocked', 'failed')),
    submit_mode TEXT NOT NULL DEFAULT 'browser-assisted',
    prepared_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    packet_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    audit JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_career_applications_user_status
    ON career_applications(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_applications_batch
    ON career_applications(user_id, batch_id);

CREATE TABLE IF NOT EXISTS career_saved_searches (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    lane TEXT NOT NULL DEFAULT 'cash-now' CHECK (lane IN ('cash-now', 'engineering', 'trainer')),
    source_set JSONB NOT NULL DEFAULT '[]'::jsonb,
    schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_career_saved_searches_user_lane
    ON career_saved_searches(user_id, lane, updated_at DESC);

CREATE TABLE IF NOT EXISTS career_outcomes (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dossier_id TEXT REFERENCES career_dossiers(id) ON DELETE SET NULL,
    application_id TEXT REFERENCES career_applications(id) ON DELETE SET NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('callback', 'rejection', 'interview', 'offer', 'ignored')),
    callback_quality TEXT,
    pay TEXT,
    lesson TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_career_outcomes_user_created
    ON career_outcomes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS career_search_runs (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lane TEXT NOT NULL DEFAULT 'cash-now' CHECK (lane IN ('cash-now', 'engineering', 'trainer')),
    query TEXT NOT NULL,
    source_set JSONB NOT NULL DEFAULT '[]'::jsonb,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_count INTEGER NOT NULL DEFAULT 0,
    dedupe_fingerprints JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_dossier_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_career_search_runs_user_created
    ON career_search_runs(user_id, created_at DESC);

ALTER TABLE career_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_search_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY career_profiles_owner ON career_profiles
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY career_dossiers_owner ON career_dossiers
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY career_applications_owner ON career_applications
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY career_saved_searches_owner ON career_saved_searches
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY career_outcomes_owner ON career_outcomes
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY career_search_runs_owner ON career_search_runs
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON career_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON career_dossiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON career_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON career_saved_searches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON career_outcomes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON career_search_runs TO authenticated;
