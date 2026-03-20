import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  CheckCircle,
  Info,
  Warning,
  WarningCircle,
  X,
} from '@phosphor-icons/react'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  action?: { label: string; onClick: () => void }
  persistent?: boolean
}

type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const iconForType: Record<Toast['type'], React.ElementType> = {
  success: CheckCircle,
  error: WarningCircle,
  warning: Warning,
  info: Info,
}

const iconColorForType: Record<Toast['type'], string> = {
  success: 'var(--secondary)',
  error: 'var(--red-500)',
  warning: 'var(--amber)',
  info: 'var(--blue)',
}

const positionStyles: Record<ToastPosition, React.CSSProperties> = {
  'top-left': { top: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
}

function getPosition(): ToastPosition {
  try {
    const stored = localStorage.getItem('toast-position')
    if (
      stored === 'top-left' ||
      stored === 'top-right' ||
      stored === 'bottom-left' ||
      stored === 'bottom-right'
    ) {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return 'top-left'
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    setDismissing(true)
    dismissTimerRef.current = setTimeout(() => {
      setToast(null)
      setDismissing(false)
    }, 200)
  }, [])

  const show = useCallback(
    (incoming: Omit<Toast, 'id'>) => {
      // Clear any existing timers
      if (timerRef.current) clearTimeout(timerRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      setDismissing(false)

      const newToast: Toast = {
        ...incoming,
        id: Math.random().toString(36).slice(2, 9),
      }
      setToast(newToast)

      // Auto-dismiss unless persistent
      if (!incoming.persistent) {
        timerRef.current = setTimeout(dismiss, 5000)
      }
    },
    [dismiss],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  const position = getPosition()
  const isAlert = toast?.type === 'error' || toast?.type === 'warning'
  const Icon = toast ? iconForType[toast.type] : null

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          role={isAlert ? 'alert' : 'status'}
          aria-live={isAlert ? 'assertive' : 'polite'}
          style={{
            position: 'fixed',
            zIndex: 'var(--z-toast)',
            ...positionStyles[position],
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-high)',
            padding: '12px 16px',
            minWidth: 280,
            maxWidth: 420,
            animation: dismissing
              ? 'toastOut 0.2s ease forwards'
              : 'toastIn 0.3s var(--ease-spring) both',
          }}
        >
          {Icon && (
            <Icon
              size={20}
              weight="fill"
              style={{
                color: iconColorForType[toast.type],
                flexShrink: 0,
              }}
            />
          )}

          <span
            style={{
              flex: 1,
              fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
              lineHeight: 1.4,
            }}
          >
            {toast.message}
          </span>

          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                flexShrink: 0,
              }}
            >
              {toast.action.label}
            </button>
          )}

          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={dismiss}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  )
}
