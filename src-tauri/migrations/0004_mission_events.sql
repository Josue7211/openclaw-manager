-- Mission events (synced from Supabase for offline reads)
CREATE TABLE IF NOT EXISTS mission_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    file_path TEXT,
    tool_input TEXT,
    tool_output TEXT,
    model_name TEXT,
    elapsed_seconds REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mission_events_mission ON mission_events(mission_id, seq);
CREATE INDEX IF NOT EXISTS idx_mission_events_user ON mission_events(user_id);
