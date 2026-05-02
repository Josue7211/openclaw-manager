import { useState, useCallback, useEffect, useRef, type SetStateAction, type Dispatch } from 'react'

export const LOCAL_STORAGE_STATE_EVENT = 'local-storage-state-changed'

function readStoredValue<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored !== null ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * Like `useState`, but persists the value to localStorage under the given key.
 * Reads the stored value on mount; writes on every update.
 */
export function useLocalStorageState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const defaultValueRef = useRef(defaultValue)
  defaultValueRef.current = defaultValue
  const [state, setState] = useState<T>(() => readStoredValue(key, defaultValue))

  useEffect(() => {
    const syncFromStorage = () => {
      setState(readStoredValue(key, defaultValueRef.current))
    }

    syncFromStorage()

    const onStorage = (event: StorageEvent) => {
      if (event.key === key) syncFromStorage()
    }

    const onLocalChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail
      if (!detail?.key || detail.key === key) syncFromStorage()
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(LOCAL_STORAGE_STATE_EVENT, onLocalChange)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LOCAL_STORAGE_STATE_EVENT, onLocalChange)
    }
  }, [key])

  const setValue: Dispatch<SetStateAction<T>> = useCallback((action: SetStateAction<T>) => {
    setState(prev => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(prev) : action
      localStorage.setItem(key, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_STATE_EVENT, {
        detail: { key },
      }))
      return next
    })
  }, [key])
  return [state, setValue]
}
