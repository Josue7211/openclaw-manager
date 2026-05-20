import { useCallback, useEffect, useRef, useState } from 'react'

type ClipboardWriter = {
  writeText: (value: string) => Promise<void>
}

function getClipboardWriter(): ClipboardWriter | null {
  if (typeof navigator === 'undefined') return null
  if (!navigator.clipboard?.writeText) return null
  return navigator.clipboard
}

export function useCopyToClipboard<TContext = void>({
  timeout = 1600,
  trackState = true,
  onCopy,
  onError,
}: {
  timeout?: number
  trackState?: boolean
  onCopy?: (context: TContext) => void
  onError?: (error: Error, context: TContext) => void
} = {}) {
  const [copiedContext, setCopiedContext] = useState<TContext | null>(null)
  const [errorContext, setErrorContext] = useState<TContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCopyRef = useRef(onCopy)
  const onErrorRef = useRef(onError)

  onCopyRef.current = onCopy
  onErrorRef.current = onError

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleReset = useCallback(() => {
    clearTimer()
    if (timeout === 0) return
    timerRef.current = setTimeout(() => {
      setCopiedContext(null)
      setErrorContext(null)
      timerRef.current = null
    }, timeout)
  }, [clearTimer, timeout])

  const copyToClipboard = useCallback(async (value: string, context: TContext): Promise<boolean> => {
    const clipboard = getClipboardWriter()
    if (!clipboard) {
      const error = new Error('Clipboard API unavailable.')
      onErrorRef.current?.(error, context)
      if (trackState) {
        setCopiedContext(null)
        setErrorContext(context)
        scheduleReset()
      }
      return false
    }

    try {
      await clipboard.writeText(value)
      onCopyRef.current?.(context)
      if (trackState) {
        setCopiedContext(context)
        setErrorContext(null)
        scheduleReset()
      }
      return true
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Failed to copy.')
      onErrorRef.current?.(normalized, context)
      if (trackState) {
        setCopiedContext(null)
        setErrorContext(context)
        scheduleReset()
      }
      return false
    }
  }, [scheduleReset, trackState])

  useEffect(() => clearTimer, [clearTimer])

  return {
    copyToClipboard,
    copiedContext,
    errorContext,
    isCopied: copiedContext !== null,
  }
}
