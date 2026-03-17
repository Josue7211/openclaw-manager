-- Add user_id scoping to api_cache so cached data is isolated per user.
-- Recreate the table with a composite primary key (user_id, key).

-- Preserve existing data by renaming, recreating, and migrating.
ALTER TABLE api_cache RENAME TO _api_cache_old;

CREATE TABLE api_cache (
    user_id TEXT NOT NULL DEFAULT '',
    key TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
);

INSERT INTO api_cache (user_id, key, data, updated_at)
    SELECT '', key, data, updated_at FROM _api_cache_old;

DROP TABLE _api_cache_old;
