-- RLS policies for tables accessed directly from the browser via Supabase client.
-- This migration runs in the Supabase dashboard, not via sqlx.
-- Stored here for documentation and version control.

-- Todos
ALTER TABLE IF EXISTS todos ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users DEFAULT auth.uid();
ALTER TABLE IF EXISTS todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "users own their todos" ON todos FOR ALL USING (auth.uid() = user_id);

-- Knowledge entries
ALTER TABLE IF EXISTS knowledge_entries ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users DEFAULT auth.uid();
ALTER TABLE IF EXISTS knowledge_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "users own their knowledge" ON knowledge_entries FOR ALL USING (auth.uid() = user_id);

-- Cache (read-only for all authenticated users)
ALTER TABLE IF EXISTS cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "authenticated read cache" ON cache FOR SELECT USING (auth.role() = 'authenticated');

-- Prefs
ALTER TABLE IF EXISTS prefs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users DEFAULT auth.uid();
ALTER TABLE IF EXISTS prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "users own their prefs" ON prefs FOR ALL USING (auth.uid() = user_id);
