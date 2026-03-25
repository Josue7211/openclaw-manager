import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_BASE, getApiKey } from '@/lib/api'

// Module-level singleton — shared across all consumers
let gatewayEventSource: EventSource | null = null
let refCount = 0

/** Per-event-name callback sets for direct subscriptions */
const eventListeners = new Map<string, Set<(payload: unknown) => void>>()

/**
 * Create or reuse the singleton EventSource connected to /api/gateway/events.
 *
 * Named SSE events are listened for individually using addEventListener.
 * Each event is parsed as JSON and dispatched to per-event-name callbacks.
 */
function getGatewayEventSource(eventNames: string[]): EventSource {
  if (!gatewayEventSource || gatewayEventSource.readyState === EventSource.CLOSED) {
    let url = `${API_BASE}/api/gateway/events`
    const apiKey = getApiKey()
    if (apiKey) {
      url += `?api_key=${encodeURIComponent(apiKey)}`
    }

    gatewayEventSource = new EventSource(url)

    for (const eventName of eventNames) {
      gatewayEventSource.addEventListener(eventName, (event: Event) => {
        const messageEvent = event as MessageEvent
        try {
          const payload = JSON.parse(messageEvent.data)
          const listeners = eventListeners.get(eventName)
          if (listeners) {
            listeners.forEach(cb => {
              try {
                cb(payload)
              } catch (err) {
                console.error(`[gateway-sse] listener error for "${eventName}":`, err)
              }
            })
          }
        } catch {
          // Ignore parse errors (keepalive comments, etc.)
        }
      })
    }

    gatewayEventSource.onerror = () => {
      console.debug('[gateway-sse] connection error, will auto-reconnect')
    }
  }
  return gatewayEventSource
}

function closeGatewayEventSourceIfUnused() {
  if (refCount <= 0 && gatewayEventSource) {
    gatewayEventSource.close()
    gatewayEventSource = null
    refCount = 0
  }
}

export interface UseGatewaySSEOptions {
  /** Specific gateway event names to listen for */
  events: string[]
  /** Callback fired for each matching gateway event */
  onEvent?: (eventName: string, payload: unknown) => void
  /** Query keys to invalidate when specific events fire.
   * e.g. { chat: queryKeys.gatewaySessions } invalidates sessions query on chat events */
  queryKeys?: Record<string, readonly unknown[]>
}

/**
 * Subscribe to OpenClaw gateway events via the SSE bridge at /api/gateway/events.
 *
 * Uses a singleton EventSource shared across all consumers. The hook manages
 * refcounting and closes the connection when the last consumer unmounts.
 *
 * Call with `undefined` to disable SSE (e.g. in demo mode):
 *   useGatewaySSE(demo ? undefined : { events: ['chat'], queryKeys: { chat: ... } })
 */
export function useGatewaySSE(options?: UseGatewaySSEOptions) {
  const queryClient = useQueryClient()
  const optionsRef = useRef(options)
  optionsRef.current = options

  const eventsKey = options?.events?.join(',') ?? ''

  useEffect(() => {
    if (!options) return

    const targetEvents = options.events ?? []
    if (targetEvents.length === 0) return

    // Establish/reuse the SSE connection
    getGatewayEventSource(targetEvents)
    refCount++

    // Register per-event callbacks
    const callbacks = new Map<string, (payload: unknown) => void>()

    for (const eventName of targetEvents) {
      const cb = (payload: unknown) => {
        const opts = optionsRef.current
        if (!opts) return

        // Invalidate query keys if configured
        if (opts.queryKeys?.[eventName]) {
          queryClient.invalidateQueries({ queryKey: opts.queryKeys[eventName] })
        }

        // Fire per-event callback
        if (opts.onEvent) {
          opts.onEvent(eventName, payload)
        }
      }

      if (!eventListeners.has(eventName)) {
        eventListeners.set(eventName, new Set())
      }
      eventListeners.get(eventName)!.add(cb)
      callbacks.set(eventName, cb)
    }

    return () => {
      // Unregister listeners
      for (const [eventName, cb] of callbacks) {
        eventListeners.get(eventName)?.delete(cb)
        if (eventListeners.get(eventName)?.size === 0) {
          eventListeners.delete(eventName)
        }
      }

      refCount--
      // Close connection if no more subscribers (with delay to avoid flicker)
      setTimeout(closeGatewayEventSourceIfUnused, 1000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey, queryClient])
}
