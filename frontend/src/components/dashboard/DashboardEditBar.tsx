import React, { useCallback, useEffect, useRef } from 'react'
import { PencilSimple, Check, Plus, ArrowCounterClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { setEditMode, undoDashboard } from '@/lib/dashboard-store'

// ---------------------------------------------------------------------------
// useLongPress hook
// ---------------------------------------------------------------------------

export function useLongPress(onLongPress: () => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const movedRef = useRef(false)

  const onPointerDown = useCallback(() => {
    movedRef.current = false
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) onLongPress()
    }, ms)
  }, [onLongPress, ms])

  const onPointerUp = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const onPointerMove = useCallback(() => {
    movedRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { onPointerDown, onPointerUp, onPointerCancel: onPointerUp, onPointerMove }
}

// ---------------------------------------------------------------------------
// DashboardEditBar
// ---------------------------------------------------------------------------

interface DashboardEditBarProps {
  editMode: boolean
  onOpenPicker: () => void
}

export const DashboardEditBar = React.memo(function DashboardEditBar({
  editMode,
  onOpenPicker,
}: DashboardEditBarProps) {
  // Page-scoped keyboard handler — Ctrl+E toggles edit, Escape exits.
  // Intentionally NOT using the global keybinding system because Ctrl+E
  // is already mapped to nav-email. This handler only fires while the
  // Dashboard is mounted; preventDefault suppresses the global shortcut.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setEditMode(!editMode)
        return
      }
      if (e.key === 'Escape' && editMode) {
        setEditMode(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editMode])

  return (
    <div
      className="dashboard-edit-bar"
      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
    >
      {editMode ? (
        <>
          <Button
            variant="primary"
            onClick={() => setEditMode(false)}
            aria-label="Save dashboard"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Check size={16} weight="bold" /> Done
          </Button>
          <Button
            variant="ghost"
            onClick={onOpenPicker}
            aria-label="Add widget"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} weight="bold" /> Add Widget
          </Button>
          <Button
            variant="ghost"
            onClick={() => undoDashboard()}
            aria-label="Undo last action"
            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          >
            <ArrowCounterClockwise size={16} />
          </Button>
        </>
      ) : (
        <button
          onClick={() => setEditMode(true)}
          aria-label="Edit dashboard"
          className="hover-bg"
          style={{
            padding: '8px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <PencilSimple size={18} />
        </button>
      )}
    </div>
  )
})
