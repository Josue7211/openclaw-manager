import { useEffect } from 'react'

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
