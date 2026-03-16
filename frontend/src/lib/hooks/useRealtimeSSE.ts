import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_BASE } from '@/lib/api'

// Module-level singleton — shared across all components
let eventSource: EventSource | null = null
let refCount = 0
const tableListeners = new Map<string, Set<() => void>>()

function getEventSource(): EventSource {
  if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
    eventSource = new EventSource(`${API_BASE}/api/events`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const { table } = data as { table: string; event: string; id?: string }
        const listeners = tableListeners.get(table)
        if (listeners) {
          listeners.forEach(cb => cb())
        }
      } catch {
        // Ignore parse errors (keepalive comments, etc.)
      }
    }

    eventSource.onerror = () => {
      // EventSource auto-reconnects — just log
      console.debug('[SSE] connection error, will auto-reconnect')
    }
  }
  return eventSource
}

function closeEventSourceIfUnused() {
  if (refCount <= 0 && eventSource) {
    eventSource.close()
    eventSource = null
    refCount = 0
  }
}

/**
 * Subscribe to Supabase Realtime events proxied through the Axum backend SSE endpoint.
 * Replaces the old `useSupabaseRealtime` hook that connected directly to Supabase.
 *
 * @param tables - Table names to listen for (e.g., ['todos', 'agents'])
 * @param options.queryKeys - Map of table name → React Query key to invalidate
 * @param options.onEvent - Optional callback when any subscribed table changes
 */
export function useRealtimeSSE(
  tables: string[],
  options: {
    queryKeys?: Record<string, readonly unknown[]>
    onEvent?: (table: string) => void
  } = {},
) {
  const queryClient = useQueryClient()
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    // Establish/reuse the SSE connection
    getEventSource()
    refCount++

    // Register listeners for each table
    const callbacks = new Map<string, () => void>()

    for (const table of tables) {
      const cb = () => {
        const opts = optionsRef.current
        if (opts.queryKeys?.[table]) {
          queryClient.invalidateQueries({ queryKey: opts.queryKeys[table] })
        }
        if (opts.onEvent) {
          opts.onEvent(table)
        }
      }

      if (!tableListeners.has(table)) {
        tableListeners.set(table, new Set())
      }
      tableListeners.get(table)!.add(cb)
      callbacks.set(table, cb)
    }

    return () => {
      // Unregister listeners
      for (const [table, cb] of callbacks) {
        tableListeners.get(table)?.delete(cb)
        if (tableListeners.get(table)?.size === 0) {
          tableListeners.delete(table)
        }
      }

      refCount--
      // Close connection if no more subscribers
      // Use setTimeout to avoid closing during React re-renders
      setTimeout(closeEventSourceIfUnused, 1000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(','), queryClient])
}

/**
 * Convenience wrapper for single-table subscriptions.
 * Equivalent to the old `useSupabaseRealtime(channel, table, { queryKey })`.
 */
export function useTableRealtime(
  table: string,
  options: {
    queryKey?: readonly unknown[]
    onEvent?: () => void
  } = {},
) {
  useRealtimeSSE(
    [table],
    {
      queryKeys: options.queryKey ? { [table]: options.queryKey } : undefined,
      onEvent: options.onEvent ? () => options.onEvent!() : undefined,
    },
  )
}
