-- Relax NOT NULL constraints on columns that may be NULL in Supabase.
-- SQLite doesn't support ALTER COLUMN, so we drop and recreate.
-- Data is synced from Supabase on next pull, so no data loss.

DROP TABLE IF EXISTS agents;
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    display_name TEXT,
    emoji TEXT,
    role TEXT,
    status TEXT DEFAULT 'idle',
    current_task TEXT DEFAULT '',
    model TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

DROP TABLE IF EXISTS todos;
CREATE TABLE todos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT DEFAULT '',
    done INTEGER DEFAULT 0,
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

DROP TABLE IF EXISTS missions;
CREATE TABLE missions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT '',
    assignee TEXT,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    task_type TEXT DEFAULT 'non-code',
    log_path TEXT,
    complexity INTEGER,
    spawn_command TEXT,
    routed_agent TEXT,
    review_status TEXT,
    review_notes TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

DROP TABLE IF EXISTS ideas;
CREATE TABLE ideas (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT '',
    description TEXT,
    why TEXT,
    effort TEXT,
    impact TEXT,
    category TEXT,
    status TEXT DEFAULT 'new',
    priority TEXT,
    mission_id TEXT,
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

DROP TABLE IF EXISTS workflow_notes;
CREATE TABLE workflow_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT DEFAULT '',
    content TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Reset sync cursors so all data re-syncs
DELETE FROM _sync_state WHERE table_name IN ('agents', 'todos', 'missions', 'ideas', 'workflow_notes');
