-- ============================================================================
-- Mission Control: User Profiles (encryption salt)
-- ============================================================================
-- Stores a random 16-byte salt per user for Argon2id key derivation.
-- Previously, derive_key() used the user_id as salt — a deterministic,
-- publicly-visible value. This migration introduces a proper random salt
-- that is generated on first login and persisted across devices.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id          UUID        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  encryption_salt  TEXT        NOT NULL,  -- Base64-encoded 16-byte random salt
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only access their own profile
CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-update updated_at (reuses function from 20260316000000_rls_user_isolation.sql)
DROP TRIGGER IF EXISTS set_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
