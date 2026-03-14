import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _instance: SupabaseClient | null = null

export function createAuthClient(): SupabaseClient | null {
  if (_instance) return _instance
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Demo mode — no Supabase configured
    return null
  }
  _instance = createClient(url, key, {
    auth: { flowType: 'pkce' },
  })
  return _instance
}

/** Pre-initialized singleton — null when in demo mode (no Supabase configured) */
export const supabase = createAuthClient()
