CREATE TABLE IF NOT EXISTS growth_creator_watchlist (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'active',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_creator_watchlist_user_platform
    ON growth_creator_watchlist(user_id, platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_viral_videos (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'captured',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_viral_videos_user_platform
    ON growth_viral_videos(user_id, platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_content_recipes (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'testing' CHECK (status IN ('winning', 'promising', 'testing', 'stale', 'failed')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_content_recipes_user_status
    ON growth_content_recipes(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_content_ideas (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'scripted', 'needs-video', 'ready-for-approval', 'queued', 'recorded', 'packaged', 'posted', 'archived')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_content_ideas_user_status
    ON growth_content_ideas(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_post_packages (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'needs-video', 'ready-for-approval', 'approved', 'queued', 'posted', 'blocked')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_post_packages_user_status
    ON growth_post_packages(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_post_metric_snapshots (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT '24h',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_post_metric_snapshots_user_platform
    ON growth_post_metric_snapshots(user_id, platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_quarantined_analytics_rows (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'quarantined',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_quarantined_analytics_rows_user_platform
    ON growth_quarantined_analytics_rows(user_id, platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_connector_accounts (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'configured', 'oauth_required', 'permission_missing', 'review_required', 'ready', 'error')),
    account_label TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_connector_accounts_user_platform
    ON growth_connector_accounts(user_id, platform)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS growth_agent_runs (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    run_type TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'blocked' CHECK (status IN ('running', 'completed', 'blocked', 'failed')),
    source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    blocked_reason TEXT,
    connector_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_agent_runs_user_type
    ON growth_agent_runs(user_id, run_type, started_at DESC);

ALTER TABLE growth_creator_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_viral_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_content_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_content_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_post_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_post_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_quarantined_analytics_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_connector_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY growth_creator_watchlist_owner ON growth_creator_watchlist
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY growth_viral_videos_owner ON growth_viral_videos
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY growth_content_recipes_owner ON growth_content_recipes
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY growth_content_ideas_owner ON growth_content_ideas
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY growth_post_packages_owner ON growth_post_packages
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY growth_post_metric_snapshots_owner ON growth_post_metric_snapshots
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY growth_quarantined_analytics_rows_owner ON growth_quarantined_analytics_rows
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY growth_connector_accounts_owner ON growth_connector_accounts
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY growth_agent_runs_owner ON growth_agent_runs
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON growth_creator_watchlist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_viral_videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_content_recipes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_content_ideas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_post_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_post_metric_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_quarantined_analytics_rows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_connector_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_agent_runs TO authenticated;
