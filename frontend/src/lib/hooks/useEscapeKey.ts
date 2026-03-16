import { useEffect } from 'react'

/**
 * Invoke a callback when the Escape key is pressed.
 * Pass `enabled = false` to temporarily disable the listener (e.g. when a modal is closed).
 */
export function useEscapeKey(callback: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); callback() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [callback, enabled])
}
