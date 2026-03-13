import { createClient, SupabaseClient } from '@supabase/supabase-js'

let authClient: SupabaseClient | null = null

export function createAuthClient(): SupabaseClient {
  if (authClient) return authClient
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
  authClient = createClient(url, key)
  return authClient
}
