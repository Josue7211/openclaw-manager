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

export default memo(function SecondsAgo({ sinceMs }: { sinceMs: number }) {
  useSyncExternalStore(subscribe, () => tick)
  const s = Math.floor((Date.now() - sinceMs) / 1000)
  return <>{s}s ago</>
})
