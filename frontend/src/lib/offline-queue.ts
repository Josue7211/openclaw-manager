export interface QueuedMutation {
  id: string
  endpoint: string
  method: 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  timestamp: number
  retries: number
}

const STORAGE_KEY = 'offline-mutation-queue'
const MAX_RETRIES = 5

// In-memory subscribers for reactive queue-size display
type Listener = () => void
const listeners = new Set<Listener>()
function notify() {
  for (const fn of listeners) fn()
}

/** Subscribe to queue changes (useSyncExternalStore compatible) */
export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Get current queue length (useSyncExternalStore compatible snapshot) */
export function getQueueLength(): number {
  return getQueue().length
}

/** Read the persisted queue from localStorage */
export function getQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : []
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedMutation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  notify()
}

/** Add a failed mutation to the offline queue */
export function queueMutation(
  endpoint: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
) {
  const queue = getQueue()
  const entry: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    endpoint,
    method,
    body,
    timestamp: Date.now(),
    retries: 0,
  }
  queue.push(entry)
  saveQueue(queue)
}

/** Remove all queued mutations */
export function clearQueue() {
  localStorage.removeItem(STORAGE_KEY)
  notify()
}

export interface ProcessResult {
  attempted: number
  succeeded: number
  remaining: number
  discarded: number
}

/** Replay all queued mutations in order, removing successful ones */
export async function processQueue(): Promise<ProcessResult> {
  const queue = getQueue()
  if (queue.length === 0) return { attempted: 0, succeeded: 0, remaining: 0, discarded: 0 }

  const { api } = await import('./api')
  const remaining: QueuedMutation[] = []
  let succeeded = 0
  let discarded = 0

  for (const entry of queue) {
    try {
      switch (entry.method) {
        case 'POST':  await api.post(entry.endpoint, entry.body); break
        case 'PATCH': await api.patch(entry.endpoint, entry.body); break
        case 'DELETE': await api.del(entry.endpoint, entry.body); break
      }
      succeeded++
    } catch {
      entry.retries += 1
      if (entry.retries < MAX_RETRIES) {
        remaining.push(entry)
      } else {
        discarded++
      }
    }
  }

  saveQueue(remaining)
  return { attempted: queue.length, succeeded, remaining: remaining.length, discarded }
}
