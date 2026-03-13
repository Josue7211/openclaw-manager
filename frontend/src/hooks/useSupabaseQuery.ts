import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

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
      const path = `/api/${table}${qs ? `?${qs}` : ''}`

      // Try the Axum backend first (uses service_role key, bypasses RLS)
      try {
        const json = await api.get<Record<string, unknown> | T[]>(path)
        // API responses are typically { table: [...] } or plain arrays
        if (Array.isArray(json)) return json as T[]
        if ((json as Record<string, unknown>)[table] && Array.isArray((json as Record<string, unknown>)[table])) return (json as Record<string, unknown>)[table] as T[]
        // If response is an object with a single array value, use it
        const values = Object.values(json as Record<string, unknown>)
        const arr = values.find((v) => Array.isArray(v))
        if (arr) return arr as T[]
        return [] as T[]
      } catch {
        // ApiError or network error -- fall through to Supabase fallback
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

  const apiPath = `/api/${table}`

  return {
    insert: useMutation({
      mutationFn: async (values: Partial<T>) => {
        // Try API first
        try {
          return await api.post(apiPath, values)
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
          return await api.patch(apiPath, { id, ...values })
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
          await api.del(apiPath, { id })
          return
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
