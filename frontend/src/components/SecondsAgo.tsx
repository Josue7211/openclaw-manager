import { memo, useSyncExternalStore } from 'react'

// Shared tick — one interval for ALL SecondsAgo instances
let tick = 0
const listeners = new Set<() => void>()

const interval = setInterval(() => {
  tick++
  listeners.forEach(l => l())
}, 1000)

// Prevent interval from keeping Node process alive in tests
if (typeof interval === 'object' && 'unref' in interval) (interval as { unref: () => void }).unref()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function formatAge(sinceMs: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000))
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (days < 30) return `${weeks}w ago`

  const months = Math.floor(days / 30)
  if (days < 365) return `${months}mo ago`

  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export default memo(function SecondsAgo({ sinceMs }: { sinceMs: number }) {
  useSyncExternalStore(subscribe, () => tick)
  return <>{formatAge(sinceMs)}</>
})
