import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { API_BASE } from '@/lib/api'

/**
 * Generic query hook that fetches data through the Axum backend API first,
 * falling back to direct Supabase client if the API route doesn't exist.
 *
 * Why API-first: the Supabase anon key is blocked by RLS on most tables.
 * The Axum backend uses the service_role key and bypasses RLS.
 *
 * API convention: GET /api/{table} returns { {table}: [...] } or [...].
 */
export function useSupabaseQuery<T = Record<string, unknown>>(
  key: string[],
  table: string,
  options?: {
    select?: string
    order?: { column: string; ascending?: boolean }
    filter?: Record<string, unknown>
    enabled?: boolean
  }
) {
  return useQuery<T[]>({
    queryKey: key,
    enabled: options?.enabled !== false,
    queryFn: async () => {
      // Build query params for the API route
      const params = new URLSearchParams()
      if (options?.select) params.set('select', options.select)
      if (options?.order) {
        params.set('order', options.order.column)
        params.set('ascending', String(options.order.ascending ?? false))
      }
      if (options?.filter) {
        for (const [col, val] of Object.entries(options.filter)) {
          params.set(col, String(val))
        }
      }

      const qs = params.toString()
      const url = `${API_BASE}/api/${table}${qs ? `?${qs}` : ''}`

      // Try the Axum backend first (uses service_role key, bypasses RLS)
      try {
        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          // API responses are typically { table: [...] } or plain arrays
          if (Array.isArray(json)) return json as T[]
          if (json[table] && Array.isArray(json[table])) return json[table] as T[]
          // If response is an object with a single array value, use it
          const values = Object.values(json)
          const arr = values.find((v) => Array.isArray(v))
          if (arr) return arr as T[]
          return [] as T[]
        }
        // Non-OK response -- fall through to Supabase fallback
      } catch {
        // Network error or API unreachable -- fall through to Supabase fallback
      }

      // Fallback: direct Supabase query (may fail if RLS blocks the anon key)
      if (!supabase) throw new Error('API unreachable and Supabase not configured')
      let query = supabase.from(table).select(options?.select || '*')
      if (options?.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending ?? false })
      }
      if (options?.filter) {
        for (const [col, val] of Object.entries(options.filter)) {
          query = query.eq(col, val as string | number | boolean)
        }
      }
      const { data, error } = await query
      if (error) throw error
      return data as T[]
    },
  })
}

export function useSupabaseMutation<T = Record<string, unknown>>(
  table: string,
  options?: { invalidateKeys?: string[][] }
) {
  const queryClient = useQueryClient()

  const apiUrl = `${API_BASE}/api/${table}`

  return {
    insert: useMutation({
      mutationFn: async (values: Partial<T>) => {
        // Try API first
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
          })
          if (res.ok) return res.json()
        } catch {
          // fall through to Supabase
        }
        if (!supabase) throw new Error('API unreachable and Supabase not configured')
        const { data, error } = await supabase.from(table).insert(values as Record<string, unknown>).select().single()
        if (error) throw error
        return data
      },
      onSuccess: () => {
        options?.invalidateKeys?.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
      },
    }),
    update: useMutation({
      mutationFn: async ({ id, ...values }: { id: string } & Partial<T>) => {
        // Try API first
        try {
          const res = await fetch(apiUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...values }),
          })
          if (res.ok) return res.json()
        } catch {
          // fall through to Supabase
        }
        if (!supabase) throw new Error('API unreachable and Supabase not configured')
        const { data, error } = await supabase.from(table).update(values as Record<string, unknown>).eq('id', id).select().single()
        if (error) throw error
        return data
      },
      onSuccess: () => {
        options?.invalidateKeys?.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
      },
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        // Try API first
        try {
          const res = await fetch(apiUrl, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          })
          if (res.ok) return
        } catch {
          // fall through to Supabase
        }
        if (!supabase) throw new Error('API unreachable and Supabase not configured')
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) throw error
      },
      onSuccess: () => {
        options?.invalidateKeys?.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
      },
    }),
  }
}
