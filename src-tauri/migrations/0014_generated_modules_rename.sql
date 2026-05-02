-- Intentionally empty.
-- Older local SQLite databases are repaired in Rust before migrations run,
-- and databases that already use generated_modules should treat this as a no-op.
SELECT 1;
