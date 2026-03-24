/**
 * Unread Badge Store -- reactive state for sidebar unread indicators.
 *
 * Follows the useSyncExternalStore pattern (like keybindings.ts, sidebar-config.ts).
 * Maintains a map of module href -> unread count, driven by event-bus subscriptions.
 */

import { useSyncExternalStore } from 'react'
import { subscribe } from './event-bus'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnreadCounts {
  [moduleHref: string]: number // e.g. '/messages': 3, '/missions': 1
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _counts: UnreadCounts = {}
const _listeners = new Set<() => void>()

function notifyListeners(): void {
  _listeners.forEach(fn => fn())
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the current snapshot of unread counts. */
export function getUnreadCounts(): UnreadCounts {
  return _counts
}

/** Subscribe to changes in unread counts. Returns an unsubscribe function. */
export function subscribeUnreadCounts(listener: () => void): () => void {
  _listeners.add(listener)
  return () => { _listeners.delete(listener) }
}

/** React hook for reactive unread counts via useSyncExternalStore. */
export function useUnreadCounts(): UnreadCounts {
  return useSyncExternalStore(subscribeUnreadCounts, getUnreadCounts, getUnreadCounts)
}

/** Increment the unread count for a given module href. */
export function incrementUnread(href: string, amount: number = 1): void {
  _counts = { ..._counts, [href]: (_counts[href] || 0) + amount }
  notifyListeners()
}

/** Clear the unread count for a given module href (mark as read). */
export function markRead(href: string): void {
  if (_counts[href]) {
    const { [href]: _, ...rest } = _counts
    _counts = rest
    notifyListeners()
  }
}

/** Set the unread count for a given module href to an exact value. */
export function setUnreadCount(href: string, count: number): void {
  if (count <= 0) {
    markRead(href)
    return
  }
  _counts = { ..._counts, [href]: count }
  notifyListeners()
}

// ---------------------------------------------------------------------------
// Event-bus auto-subscriptions -- wire activity events to badge updates
// ---------------------------------------------------------------------------

subscribe('new-message', () => incrementUnread('/messages'))
subscribe('mission-updated', () => incrementUnread('/missions'))
subscribe('todo-changed', () => incrementUnread('/todos'))
subscribe('pipeline-updated', () => incrementUnread('/pipeline'))
