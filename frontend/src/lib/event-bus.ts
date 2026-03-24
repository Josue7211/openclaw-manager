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
  | 'pipeline-updated'
  | 'settings-changed'
  | 'connection-status'
  // Gateway events (from OpenClaw WebSocket via SSE bridge)
  | 'gateway-agent'
  | 'gateway-chat'
  | 'gateway-presence'
  | 'gateway-cron'
  | 'gateway-shutdown'
  | 'gateway-health'
  | 'gateway-talk-mode'
  | 'gateway-node-pair-requested'
  | 'gateway-node-pair-resolved'
  | 'gateway-node-invoke-request'
  | 'gateway-device-pair-requested'
  | 'gateway-device-pair-resolved'
  | 'gateway-voicewake-changed'
  | 'gateway-approval-requested'
  | 'gateway-approval-resolved'

export interface AppEvent {
  type: EventType
  data?: unknown
  source?: string // e.g. 'sse' | 'supabase' | 'local'
  timestamp: number
}

/**
 * Maps gateway SSE event names to event-bus types.
 * The backend filters out connect.challenge, tick, and heartbeat before they
 * reach the frontend, so only these 14 user-facing events are mapped.
 */
export const GATEWAY_EVENT_MAP: Record<string, EventType> = {
  'agent': 'gateway-agent',
  'chat': 'gateway-chat',
  'presence': 'gateway-presence',
  'cron': 'gateway-cron',
  'shutdown': 'gateway-shutdown',
  'health': 'gateway-health',
  'talk.mode': 'gateway-talk-mode',
  'node.pair.requested': 'gateway-node-pair-requested',
  'node.pair.resolved': 'gateway-node-pair-resolved',
  'node.invoke.request': 'gateway-node-invoke-request',
  'device.pair.requested': 'gateway-device-pair-requested',
  'device.pair.resolved': 'gateway-device-pair-resolved',
  'voicewake.changed': 'gateway-voicewake-changed',
  'exec.approval.requested': 'gateway-approval-requested',
  'exec.approval.resolved': 'gateway-approval-resolved',
}

type Handler = (event: AppEvent) => void

const listeners = new Map<EventType, Set<Handler>>()

/** Subscribe to events of the given type. Returns an unsubscribe function. */
export function subscribe(type: EventType, handler: Handler): () => void {
  let set = listeners.get(type)
  if (!set) {
    set = new Set()
    listeners.set(type, set)
  }
  set.add(handler)
  return () => {
    set!.delete(handler)
    if (set!.size === 0) listeners.delete(type)
  }
}

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
