import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

// Client-side safe instance (only used in browser components)
export const supabase = url && anon ? createClient(url, anon) : null as any

// Server-side admin instance (only used in API routes)
export const supabaseAdmin = url && service ? createClient(url, service) : null as any
