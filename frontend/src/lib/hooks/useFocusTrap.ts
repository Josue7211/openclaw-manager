import { useEffect, useRef } from 'react'

/**
 * Trap keyboard focus within a container while active.
 * Returns a ref to attach to the dialog/modal root element.
 * Automatically focuses the first focusable child on activation.
 */
export function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || !ref.current) return
    const el = ref.current
    const getFocusable = () =>
      el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )

    const initial = getFocusable()
    if (initial.length > 0) initial[0].focus()

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [active])

  return ref
}
