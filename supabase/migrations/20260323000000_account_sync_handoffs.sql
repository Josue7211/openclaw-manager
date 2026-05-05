-- Trusted-device account sync handoff requests.
-- Stores only public keys and encrypted account-sync-key envelopes.

CREATE TABLE IF NOT EXISTS public.account_sync_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requesting_device_name TEXT NOT NULL DEFAULT 'Unknown device',
  verification_code TEXT NOT NULL DEFAULT '',
  request_public_key TEXT NOT NULL,
  approver_device_name TEXT,
  approver_public_key TEXT,
  encrypted_key TEXT,
  nonce TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'claimed', 'expired', 'rejected')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_sync_handoffs
  ADD COLUMN IF NOT EXISTS verification_code TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_account_sync_handoffs_user_status
  ON public.account_sync_handoffs(user_id, status, expires_at);

ALTER TABLE public.account_sync_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_sync_handoffs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_sync_handoffs_select_own ON public.account_sync_handoffs;
CREATE POLICY account_sync_handoffs_select_own
  ON public.account_sync_handoffs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS account_sync_handoffs_insert_own ON public.account_sync_handoffs;
CREATE POLICY account_sync_handoffs_insert_own
  ON public.account_sync_handoffs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS account_sync_handoffs_update_own ON public.account_sync_handoffs;
CREATE POLICY account_sync_handoffs_update_own
  ON public.account_sync_handoffs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS account_sync_handoffs_delete_own ON public.account_sync_handoffs;
CREATE POLICY account_sync_handoffs_delete_own
  ON public.account_sync_handoffs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
