-- Canary tokens and honeypot data for breach detection
-- These fake secrets are never used by the app. If accessed, it indicates a breach.

CREATE TABLE IF NOT EXISTS public._canary_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_name TEXT NOT NULL,
  token_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed TIMESTAMPTZ
);

INSERT INTO public._canary_tokens (token_name, token_value, description) VALUES
  ('ADMIN_API_KEY', 'sk-admin-canary-4f8a2b1c9d3e7f6a5b4c2d1e0f9a8b7c', 'Fake admin API key — if accessed, breach detected'),
  ('BACKUP_DB_PASSWORD', 'canary-pwd-X9kL2mN4pQ7rS1tV3wY5zA8bC0dE6fG', 'Fake backup password — if accessed, breach detected'),
  ('STRIPE_SECRET_KEY', 'sk_live_canary_51JQkW4h8mZxN2yR7tV0wX3bA6cD9eF', 'Fake Stripe key — if accessed, breach detected');

ALTER TABLE public._canary_tokens ENABLE ROW LEVEL SECURITY;
-- No RLS policies = no access through PostgREST

-- Canary access log for monitoring
CREATE TABLE IF NOT EXISTS public._canary_access_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  queried_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  db_user TEXT DEFAULT current_user,
  client_addr TEXT
);

ALTER TABLE public._canary_access_log ENABLE ROW LEVEL SECURITY;

-- Revoke API access from canary tables
REVOKE ALL ON public._canary_tokens FROM anon, authenticated;
REVOKE ALL ON public._canary_access_log FROM anon, authenticated;

-- Canary user in auth.users (FK target for user_secrets canary row)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'canary@honeypot.internal',
  '$2a$10$CANARY_HASH_NOT_A_REAL_PASSWORD_HASH_DO_NOT_USE',
  now(), now(), now(), '', '', false
) ON CONFLICT (id) DO NOTHING;

-- Canary row in user_secrets (looks like a real encrypted credential)
INSERT INTO public.user_secrets (id, user_id, service, encrypted_credentials, nonce, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  '_canary_check',
  'CANARY_ENCRYPTED_PLACEHOLDER',
  'CANARY_NONCE',
  now(), now()
) ON CONFLICT (user_id, service) DO NOTHING;

-- Integrity check function (run periodically to detect tampering)
CREATE OR REPLACE FUNCTION public._check_canary_integrity()
RETURNS TABLE(check_name TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT '_canary_tokens_count'::TEXT,
    CASE WHEN (SELECT count(*) FROM public._canary_tokens) = 3
      THEN 'OK'::TEXT ELSE 'BREACH'::TEXT END,
    format('%s tokens found (expected 3)', (SELECT count(*) FROM public._canary_tokens))::TEXT;

  RETURN QUERY
  SELECT '_canary_tokens_accessed'::TEXT,
    CASE WHEN (SELECT count(*) FROM public._canary_tokens WHERE last_accessed IS NOT NULL) = 0
      THEN 'OK'::TEXT ELSE 'BREACH'::TEXT END,
    format('%s tokens accessed', (SELECT count(*) FROM public._canary_tokens WHERE last_accessed IS NOT NULL))::TEXT;

  RETURN QUERY
  SELECT '_canary_secret_exists'::TEXT,
    CASE WHEN EXISTS(SELECT 1 FROM public.user_secrets WHERE service = '_canary_check')
      THEN 'OK'::TEXT ELSE 'BREACH'::TEXT END,
    'Canary secret in user_secrets'::TEXT;

  RETURN QUERY
  SELECT '_canary_user_exists'::TEXT,
    CASE WHEN EXISTS(SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000000')
      THEN 'OK'::TEXT ELSE 'BREACH'::TEXT END,
    'Canary user in auth.users'::TEXT;

  RETURN QUERY
  SELECT '_canary_tokens_intact'::TEXT,
    CASE WHEN (SELECT count(*) FROM public._canary_tokens
               WHERE token_value IN (
                 'sk-admin-canary-4f8a2b1c9d3e7f6a5b4c2d1e0f9a8b7c',
                 'canary-pwd-X9kL2mN4pQ7rS1tV3wY5zA8bC0dE6fG',
                 'sk_live_canary_51JQkW4h8mZxN2yR7tV0wX3bA6cD9eF'
               )) = 3
      THEN 'OK'::TEXT ELSE 'BREACH'::TEXT END,
    'Token values match originals'::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._check_canary_integrity() FROM anon, authenticated;
