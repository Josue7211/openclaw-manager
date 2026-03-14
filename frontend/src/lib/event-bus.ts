/**
 * Lightweight internal event bus.
 *
 * Provides a single, typed pub/sub channel that any data source (SSE,
 * Supabase Realtime, polling, local mutations) can publish to. Consumers
 * subscribe via `on()` or the `useEventBus` React hook.
 *
 * This does NOT replace existing data flows — it runs alongside them so
 * future features can react to cross-cutting events without tight coupling.
 */

export type EventType =
  | 'new-message'
  | 'message-read'
  | 'mission-updated'
  | 'todo-changed'
  | 'settings-changed'
  | 'connection-status'

export interface AppEvent {
  type: EventType
  data?: unknown
  source?: string // e.g. 'sse' | 'supabase' | 'local'
  timestamp: number
}

type Handler = (event: AppEvent) => void

const listeners = new Map<EventType, Set<Handler>>()

/** Publish an event to all subscribers of the given type. */
export function emit(type: EventType, data?: unknown, source?: string): void {
  const event: AppEvent = { type, data, source, timestamp: Date.now() }
  const handlers = listeners.get(type)
  if (handlers) {
    handlers.forEach((fn) => {
      try {
        fn(event)
      } catch (err) {
        console.error(`[event-bus] handler error for "${type}":`, err)
      }
    })
  }
}

/**
 * Subscribe to events of a given type.
 * Returns an unsubscribe function for convenience.
 */
export function on(type: EventType, handler: Handler): () => void {
  let set = listeners.get(type)
  if (!set) {
    set = new Set()
    listeners.set(type, set)
  }
  set.add(handler)
  return () => off(type, handler)
}

/** Unsubscribe a previously registered handler. */
export function off(type: EventType, handler: Handler): void {
  const set = listeners.get(type)
  if (set) {
    set.delete(handler)
    if (set.size === 0) listeners.delete(type)
  }
}
