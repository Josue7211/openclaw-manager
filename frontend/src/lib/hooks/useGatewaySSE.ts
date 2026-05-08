import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getRequestBaseForPath } from '@/lib/api'
import { emit, GATEWAY_EVENT_MAP } from '@/lib/event-bus'

// Module-level singleton — shared across all consumers
let gatewayEventSource: EventSource | null = null
let gatewayEventSourceOpening: Promise<void> | null = null
let refCount = 0

/** Per-event-name callback sets for direct subscriptions */
const eventListeners = new Map<string, Set<(payload: unknown) => void>>()

/** Gateway SSE event names we listen for (from GATEWAY_EVENT_MAP keys) */
const GATEWAY_EVENT_NAMES = Object.keys(GATEWAY_EVENT_MAP)

/**
 * Create or reuse the singleton EventSource connected to /api/gateway/events.
 *
 * Named SSE events (e.g. event: agent) are listened for individually using
 * addEventListener, not onmessage. Each named event is:
 * 1. Parsed as JSON
 * 2. Dispatched to the event-bus via emit()
 * 3. Forwarded to any direct per-event-name callbacks
 */
async function getGatewayEventSource(): Promise<EventSource | null> {
  if (!gatewayEventSource || gatewayEventSource.readyState === EventSource.CLOSED) {
    if (gatewayEventSourceOpening) {
      await gatewayEventSourceOpening
      return gatewayEventSource
    }

    gatewayEventSourceOpening = (async () => {
      const path = '/api/gateway/events'
      const tokenResponse = await api.post<{ token?: string }>('/api/gateway/events-token', {})
      const token = tokenResponse.token?.trim()
      if (!token) throw new Error('Gateway SSE token missing')
      const url = `${getRequestBaseForPath(path)}${path}?sseToken=${encodeURIComponent(token)}`

      gatewayEventSource = new EventSource(url)

      // Register a named event listener for each gateway event type
      for (const eventName of GATEWAY_EVENT_NAMES) {
        gatewayEventSource.addEventListener(eventName, (event: Event) => {
          const messageEvent = event as MessageEvent
          try {
            const payload = JSON.parse(messageEvent.data)
            const busType = GATEWAY_EVENT_MAP[eventName]

            // Dispatch to event-bus for cross-component communication
            if (busType) {
              emit(busType, payload, 'gateway')
            }

            // Dispatch to direct per-event-name listeners
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
        // EventSource auto-reconnects — just log
        console.debug('[gateway-sse] connection error, will auto-reconnect')
      }
    })().catch((err) => {
      console.debug('[gateway-sse] failed to open connection:', err)
      gatewayEventSource = null
    }).finally(() => {
      gatewayEventSourceOpening = null
    })
    await gatewayEventSourceOpening
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
  /** Specific gateway event names to listen for (default: all) */
  events?: string[]
  /** Callback fired for each matching gateway event */
  onEvent?: (eventName: string, payload: unknown) => void
  /** Query keys to invalidate when specific events fire.
   * e.g. { agent: queryKeys.agents } invalidates agents query on agent events */
  queryKeys?: Record<string, readonly unknown[]>
}

/**
 * Subscribe to harness gateway events via the SSE bridge at /api/gateway/events.
 *
 * Uses a singleton EventSource shared across all consumers. The hook manages
 * refcounting and closes the connection when the last consumer unmounts.
 *
 * Events are dispatched to the event-bus (for cross-component pub/sub) and
 * optionally to per-event callbacks and React Query invalidation.
 *
 * Do NOT add this hook to page components yet — phases 85 and 86 will wire
 * specific events into specific pages.
 */
export function useGatewaySSE(options: UseGatewaySSEOptions = {}) {
  const queryClient = useQueryClient()
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    // Establish/reuse the SSE connection
    refCount++
    void getGatewayEventSource()

    // Register per-event callbacks
    const callbacks = new Map<string, (payload: unknown) => void>()
    const targetEvents = optionsRef.current.events ?? GATEWAY_EVENT_NAMES

    for (const eventName of targetEvents) {
      const cb = (payload: unknown) => {
        const opts = optionsRef.current

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
   
  }, [(options.events ?? GATEWAY_EVENT_NAMES).join(','), queryClient])
}
