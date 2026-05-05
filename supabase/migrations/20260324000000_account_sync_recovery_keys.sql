-- Account sync recovery-key envelopes.
-- The recovery key itself is shown once to the user and never stored.
-- Supabase stores only a hash lookup and an encrypted account-sync-key envelope.

CREATE TABLE IF NOT EXISTS public.account_sync_recovery_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  nonce TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Recovery key',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_account_sync_recovery_keys_user_active
  ON public.account_sync_recovery_keys(user_id, revoked_at, created_at DESC);

ALTER TABLE public.account_sync_recovery_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_sync_recovery_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_sync_recovery_keys_select_own ON public.account_sync_recovery_keys;
CREATE POLICY account_sync_recovery_keys_select_own
  ON public.account_sync_recovery_keys
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS account_sync_recovery_keys_insert_own ON public.account_sync_recovery_keys;
CREATE POLICY account_sync_recovery_keys_insert_own
  ON public.account_sync_recovery_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS account_sync_recovery_keys_update_own ON public.account_sync_recovery_keys;
CREATE POLICY account_sync_recovery_keys_update_own
  ON public.account_sync_recovery_keys
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
