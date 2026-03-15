/**
 * Lightweight internal event bus.
 *
 * Provides a single, typed pub/sub channel that any data source (SSE,
 * Supabase Realtime, polling, local mutations) can publish to.
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
