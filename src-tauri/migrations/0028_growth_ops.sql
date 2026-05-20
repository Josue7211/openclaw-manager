CREATE TABLE IF NOT EXISTS growth_creator_watchlist (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'active',
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_creator_watchlist_user_platform
    ON growth_creator_watchlist(user_id, platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_viral_videos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'captured',
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_viral_videos_user_platform
    ON growth_viral_videos(user_id, platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_content_recipes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'testing' CHECK (status IN ('winning', 'promising', 'testing', 'stale', 'failed')),
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_content_recipes_user_status
    ON growth_content_recipes(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_content_ideas (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'scripted', 'needs-video', 'ready-for-approval', 'queued', 'recorded', 'packaged', 'posted', 'archived')),
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_content_ideas_user_status
    ON growth_content_ideas(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_post_packages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'needs-video', 'ready-for-approval', 'approved', 'queued', 'posted', 'blocked')),
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_post_packages_user_status
    ON growth_post_packages(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_post_metric_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT '24h',
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_post_metric_snapshots_user_platform
    ON growth_post_metric_snapshots(user_id, platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_connector_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'configured', 'oauth_required', 'permission_missing', 'review_required', 'ready', 'error')),
    account_label TEXT,
    permissions TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_connector_accounts_user_platform
    ON growth_connector_accounts(user_id, platform)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS growth_agent_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    run_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'blocked' CHECK (status IN ('running', 'completed', 'blocked', 'failed')),
    source_counts TEXT NOT NULL DEFAULT '{}',
    created_record_counts TEXT NOT NULL DEFAULT '{}',
    updated_record_counts TEXT NOT NULL DEFAULT '{}',
    blocked_reason TEXT,
    connector_statuses TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_growth_agent_runs_user_type
    ON growth_agent_runs(user_id, run_type, started_at DESC);
