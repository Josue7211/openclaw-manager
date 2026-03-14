CREATE TABLE IF NOT EXISTS api_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
