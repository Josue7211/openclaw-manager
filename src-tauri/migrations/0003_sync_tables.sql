-- Offline-first local tables mirroring Supabase for sync.
-- All UUID columns use TEXT. Timestamps are ISO-8601 TEXT.
-- Booleans are INTEGER (0/1). JSON arrays/objects are TEXT.

-- Todos
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Missions
CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    assignee TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    task_type TEXT NOT NULL DEFAULT 'non-code',
    log_path TEXT,
    complexity INTEGER,
    spawn_command TEXT,
    routed_agent TEXT,
    review_status TEXT,
    review_notes TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT,
    emoji TEXT,
    role TEXT,
    status TEXT NOT NULL DEFAULT 'idle',
    current_task TEXT DEFAULT '',
    model TEXT,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Ideas
CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    why TEXT,
    effort TEXT,
    impact TEXT,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT,
    mission_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Habits
CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '✅',
    color TEXT NOT NULL DEFAULT '#9b84ec',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Habit entries
CREATE TABLE IF NOT EXISTS habit_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    UNIQUE(user_id, habit_id, date)
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    preferences TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Captures
CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    content TEXT,
    type TEXT DEFAULT 'note',
    source TEXT DEFAULT 'web',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Changelog entries
CREATE TABLE IF NOT EXISTS changelog_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Decisions
CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    decision TEXT NOT NULL,
    alternatives TEXT,
    rationale TEXT NOT NULL,
    outcome TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    linked_mission_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Knowledge entries
CREATE TABLE IF NOT EXISTS knowledge_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    source_url TEXT,
    source_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Daily reviews
CREATE TABLE IF NOT EXISTS daily_reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    accomplishments TEXT DEFAULT '',
    priorities TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    UNIQUE(user_id, date)
);

-- Weekly reviews
CREATE TABLE IF NOT EXISTS weekly_reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    wins TEXT,
    incomplete_count TEXT,
    priorities TEXT,
    reflection TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    UNIQUE(user_id, week_start)
);

-- Retrospectives
CREATE TABLE IF NOT EXISTS retrospectives (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    what_went_well TEXT,
    what_went_wrong TEXT,
    improvements TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Workflow notes
CREATE TABLE IF NOT EXISTS workflow_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    note TEXT NOT NULL,
    applied INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Cache (key-value store)
-- Drop the old cache table from migration 0001 (different schema: key, value, expires_at)
-- and recreate with per-user columns for offline sync.
DROP TABLE IF EXISTS cache;
CREATE TABLE cache (
    key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    PRIMARY KEY (key, user_id)
);

-- Sync metadata: tracks local mutations that need to be pushed to Supabase
CREATE TABLE IF NOT EXISTS _sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    payload TEXT,
    synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Sync state: per-table cursor for incremental pull
CREATE TABLE IF NOT EXISTS _sync_state (
    table_name TEXT PRIMARY KEY,
    last_synced_at TEXT,
    last_pushed_at INTEGER
);

-- Conflict log: records when local and remote diverge
CREATE TABLE IF NOT EXISTS _conflict_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    local_data TEXT,
    remote_data TEXT,
    resolution TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_deleted ON todos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_missions_user ON missions(user_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_user ON ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_entries_user ON habit_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_entries_habit ON habit_entries(habit_id);
CREATE INDEX IF NOT EXISTS idx_captures_user ON captures(user_id);
CREATE INDEX IF NOT EXISTS idx_changelog_user ON changelog_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_changelog_date ON changelog_entries(date);
CREATE INDEX IF NOT EXISTS idx_decisions_user ON decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_user ON knowledge_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reviews_user ON daily_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reviews_date ON daily_reviews(user_id, date);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user ON weekly_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_week ON weekly_reviews(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_retrospectives_user ON retrospectives(user_id);
CREATE INDEX IF NOT EXISTS idx_retrospectives_mission ON retrospectives(mission_id);
CREATE INDEX IF NOT EXISTS idx_workflow_notes_user ON workflow_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_notes_category ON workflow_notes(user_id, category);
CREATE INDEX IF NOT EXISTS idx_cache_user ON cache(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_unsynced ON _sync_log(synced_at) WHERE synced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sync_log_table ON _sync_log(table_name, row_id);
