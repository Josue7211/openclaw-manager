import { useEffect } from 'react'
import { on, type EventType, type AppEvent } from '@/lib/event-bus'

/**
 * React hook that subscribes to a specific event-bus event type.
 * Automatically cleans up on unmount or when `type` / `handler` change.
 *
 * Usage:
 *   useEventBus('new-message', (event) => { console.log(event.data) })
 *
 * IMPORTANT: wrap `handler` in useCallback to avoid re-subscribing every render.
 */
export function useEventBus(type: EventType, handler: (event: AppEvent) => void): void {
  useEffect(() => on(type, handler), [type, handler])
}
