import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useSupabaseQuery<T = any>(
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
      let query = supabase.from(table).select(options?.select || '*')
      if (options?.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending ?? false })
      }
      if (options?.filter) {
        for (const [col, val] of Object.entries(options.filter)) {
          query = query.eq(col, val as any)
        }
      }
      const { data, error } = await query
      if (error) throw error
      return data as T[]
    },
  })
}

export function useSupabaseMutation<T = any>(
  table: string,
  options?: { invalidateKeys?: string[][] }
) {
  const queryClient = useQueryClient()

  return {
    insert: useMutation({
      mutationFn: async (values: Partial<T>) => {
        const { data, error } = await supabase.from(table).insert(values as any).select().single()
        if (error) throw error
        return data
      },
      onSuccess: () => {
        options?.invalidateKeys?.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
      },
    }),
    update: useMutation({
      mutationFn: async ({ id, ...values }: { id: string } & Partial<T>) => {
        const { data, error } = await supabase.from(table).update(values as any).eq('id', id).select().single()
        if (error) throw error
        return data
      },
      onSuccess: () => {
        options?.invalidateKeys?.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
      },
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) throw error
      },
      onSuccess: () => {
        options?.invalidateKeys?.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
      },
    }),
  }
}
