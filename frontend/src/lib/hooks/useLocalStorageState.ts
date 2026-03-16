import { useState, useCallback, type SetStateAction, type Dispatch } from 'react'

/**
 * Like `useState`, but persists the value to localStorage under the given key.
 * Reads the stored value on mount; writes on every update.
 */
export function useLocalStorageState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })
  const setValue: Dispatch<SetStateAction<T>> = useCallback((action: SetStateAction<T>) => {
    setState(prev => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(prev) : action
      localStorage.setItem(key, JSON.stringify(next))
      return next
    })
  }, [key])
  return [state, setValue]
}
