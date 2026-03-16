import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Subscribe to Supabase Realtime postgres_changes for a single table.
 *
 * Two usage modes:
 *
 * 1. **Query invalidation** — pass `queryKey` to auto-invalidate on any change:
 *    ```ts
 *    useSupabaseRealtime('agents-rt', 'agents', { queryKey: queryKeys.agents })
 *    ```
 *
 * 2. **Custom callback** — pass `onEvent` for arbitrary side-effects:
 *    ```ts
 *    useSupabaseRealtime('ideas-rt', 'ideas', { onEvent: fetchIdeas })
 *    ```
 *
 * Both can be combined: `{ queryKey, onEvent }`.
 */
export function useSupabaseRealtime(
  channelName: string,
  table: string,
  options: {
    queryKey?: readonly unknown[]
    onEvent?: () => void
  },
) {
  const queryClient = useQueryClient()
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        const opts = optionsRef.current
        if (opts.queryKey) {
          queryClient.invalidateQueries({ queryKey: opts.queryKey })
        }
        if (opts.onEvent) {
          opts.onEvent()
        }
      })
      .subscribe()

    return () => {
      supabase?.removeChannel(channel)
    }
  }, [channelName, table, queryClient])
}
