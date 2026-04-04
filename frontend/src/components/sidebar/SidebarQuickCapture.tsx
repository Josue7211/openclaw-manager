import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckSquare, Flag, Lightbulb, Note, Plus } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { plusIconStyle } from './styles'

type CaptureType = 'note' | 'task' | 'idea' | 'decision'

const CAPTURE_TYPES: { type: CaptureType; label: string; icon: React.ElementType }[] = [
  { type: 'note', label: 'Note', icon: Note },
  { type: 'task', label: 'Task', icon: CheckSquare },
  { type: 'idea', label: 'Idea', icon: Lightbulb },
  { type: 'decision', label: 'Decision', icon: Flag },
]

interface SidebarQuickCaptureProps {
  collapsed: boolean
  textOpacity: number
  onOpenChange?: (open: boolean) => void
}

const SidebarQuickCapture = React.memo(function SidebarQuickCapture({
  collapsed,
  textOpacity,
  onOpenChange,
}: SidebarQuickCaptureProps) {
  const [open, setOpen] = useState(false)
  const [captureType, setCaptureType] = useState<CaptureType>('note')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popPos, setPopPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const setOpenAndNotify = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setOpen(prev => {
      const next = typeof value === 'function' ? value(prev) : value
      onOpenChange?.(next)
      return next
    })
  }, [onOpenChange])

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopPos({ x: rect.left, y: rect.top - 140 })
    }
  }, [open])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: popPos.x, origY: popPos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPopPos({
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (ev.clientY - dragRef.current.startY),
      })
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [popPos])

  const handleSave = useCallback(async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      await api.post('/api/capture', { type: captureType, content: text.trim() })
      setText('')
      setOpenAndNotify(false)
    } catch {
      // Silently fail -- offline queue will handle retry
    } finally {
      setSaving(false)
    }
  }, [captureType, saving, setOpenAndNotify, text])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      setOpenAndNotify(false)
    }
  }, [handleSave, setOpenAndNotify])

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        ref={btnRef}
        data-testid="quick-capture"
        onClick={() => {
          setOpenAndNotify(prev => !prev)
          setTimeout(() => inputRef.current?.focus(), 100)
        }}
        title={collapsed ? 'Quick Capture' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: collapsed ? '10px 0' : '9px 16px',
          background: open ? 'var(--active-bg)' : 'transparent',
          border: 'none',
          borderRadius: '10px',
          color: open ? 'var(--text-on-color)' : 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'background 0.25s var(--ease-spring), color 0.25s var(--ease-spring)',
          fontSize: '13px',
          fontWeight: open ? 600 : 450,
          justifyContent: collapsed ? 'center' : 'flex-start',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          outline: 'none',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.background = 'var(--hover-bg)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = open ? 'var(--active-bg)' : 'transparent'
          e.currentTarget.style.color = open ? 'var(--text-on-color)' : 'var(--text-secondary)'
        }}
      >
        <Plus size={16} style={plusIconStyle} />
        {textOpacity > 0 && (
          <span style={{ opacity: textOpacity, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Quick Capture
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          style={{
            position: 'fixed',
            left: popPos.x,
            top: popPos.y,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px var(--overlay-light)',
            minWidth: '260px',
            zIndex: 10000,
            animation: 'fadeInUp 0.15s var(--ease-spring)',
          }}
        >
          <div
            onMouseDown={handleDragStart}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              cursor: 'grab',
              userSelect: 'none',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              Quick Capture
            </span>
            <button
              onClick={() => setOpenAndNotify(false)}
              aria-label="Close"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--hover-bg)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              ×
            </button>
          </div>
          <div style={{ padding: '10px' }}>
            <div
              style={{
                display: 'flex',
                gap: '4px',
                marginBottom: '8px',
              }}
            >
              {CAPTURE_TYPES.map(({ type, label, icon: CaptureIcon }) => (
                <button
                  key={type}
                  onClick={() => setCaptureType(type)}
                  title={label}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '4px 6px',
                    background: captureType === type ? 'var(--purple-a15)' : 'transparent',
                    border: `1px solid ${captureType === type ? 'var(--border-accent)' : 'var(--border)'}`,
                    borderRadius: '6px',
                    color: captureType === type ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 600,
                    transition: 'all var(--duration-fast) var(--ease-spring)',
                  }}
                >
                  <CaptureIcon size={11} />
                </button>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                gap: '6px',
              }}
            >
              <input
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`New ${captureType}...`}
                aria-label="Quick capture"
                style={{
                  flex: 1,
                  background: 'var(--bg-white-04)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <button
                onClick={handleSave}
                disabled={!text.trim() || saving}
                style={{
                  padding: '6px 10px',
                  background: text.trim() ? 'var(--accent-solid)' : 'var(--bg-white-04)',
                  border: 'none',
                  borderRadius: '8px',
                  color: text.trim() ? 'var(--text-on-color)' : 'var(--text-muted)',
                  cursor: text.trim() ? 'pointer' : 'default',
                  fontSize: '11px',
                  fontWeight: 600,
                  transition: 'all var(--duration-fast) var(--ease-spring)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? '...' : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
})

export default SidebarQuickCapture
