

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, Zap } from 'lucide-react'

type CaptureType = 'Note' | 'Task' | 'Idea' | 'Decision'

const STORAGE_KEY = 'quick-capture-widget'
const DEFAULT_SIZE = { width: 320, height: 280 }

function getDefaultPosition() {
  if (typeof window === 'undefined') return { x: 20, y: 20 }
  return {
    x: 20,
    y: window.innerHeight - DEFAULT_SIZE.height - 80,
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export default function QuickCaptureWidget() {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 20, y: 20 })
  const [size, setSize] = useState<{ width: number; height: number }>(DEFAULT_SIZE)
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState('')
  const [type, setType] = useState<CaptureType>('Note')
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null)

  const widgetRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null)
  const isDraggingRef = useRef(false)

  // Persist pos+size
  // Initialize position/size from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const saved = loadState()
    if (saved?.pos) {
      setPos(saved.pos)
    } else {
      setPos(getDefaultPosition())
    }
    if (saved?.size) setSize(saved.size)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pos, size }))
  }, [pos, size, mounted])

  // Autofocus on expand
  useEffect(() => {
    if (expanded) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [expanded])

  // Keyboard shortcuts
  useEffect(() => {
    if (!expanded) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, content, type])

  // Unified drag handler on the outer wrapper.
  // Skips textarea and buttons so their interactions work normally.
  // Differentiates click (< 4px movement) from drag (>= 4px movement).
  // On click when collapsed → expand.
  const onWrapperMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('textarea') || target.closest('button') || target.closest('[data-no-drag]')) return

    e.preventDefault()
    isDraggingRef.current = false
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const dx = ev.clientX - dragState.current.startX
      const dy = ev.clientY - dragState.current.startY
      if (!isDraggingRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isDraggingRef.current = true
      }
      if (isDraggingRef.current) {
        setPos({
          x: Math.max(0, dragState.current.origX + dx),
          y: Math.max(0, dragState.current.origY + dy),
        })
      }
    }

    const onUp = () => {
      if (!isDraggingRef.current && !expanded) {
        setExpanded(true)
      }
      dragState.current = null
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos, expanded])

  // Resize handlers
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: size.width, origH: size.height }

    const onMove = (ev: MouseEvent) => {
      if (!resizeState.current) return
      const dx = ev.clientX - resizeState.current.startX
      const dy = ev.clientY - resizeState.current.startY
      setSize({
        width: Math.max(260, resizeState.current.origW + dx),
        height: Math.max(180, resizeState.current.origH + dy),
      })
    }
    const onUp = () => {
      resizeState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [size])

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      let res: Response
      if (type === 'Task') {
        res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: content.trim() }),
        })
      } else {
        res = await fetch('/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content.trim() }),
        })
      }
      if (res.ok) {
        setContent('')
        setFlash('ok')
        setTimeout(() => {
          setFlash(null)
          setExpanded(false)
        }, 800)
      } else {
        setFlash('err')
        setTimeout(() => setFlash(null), 1500)
      }
    } catch {
      setFlash('err')
      setTimeout(() => setFlash(null), 1500)
    } finally {
      setSaving(false)
    }
  }

  const types: CaptureType[] = ['Note', 'Task', 'Idea', 'Decision']

  return (
    <div
      ref={widgetRef}
      onMouseDown={onWrapperMouseDown}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: expanded ? size.width : 'auto',
        zIndex: 9999,
        visibility: mounted ? 'visible' : 'hidden',
        fontFamily: 'inherit',
        userSelect: 'none',
      }}
    >
      {/* Collapsed pill — draggable via wrapper; click-to-expand handled by wrapper mouseup */}
      {!expanded && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(true) }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 16px',
            background: 'rgba(18, 18, 24, 0.8)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '999px',
            color: '#a1a1aa',
            cursor: 'grab',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
            transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLDivElement).style.color = '#e4e4e7'
            ;(e.currentTarget as HTMLDivElement).style.borderColor = '#71717a'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLDivElement).style.color = '#a1a1aa'
            ;(e.currentTarget as HTMLDivElement).style.borderColor = '#3f3f46'
          }}
        >
          <Zap size={14} style={{ color: '#9b84ec' }} />
          Quick Capture
          <ChevronUp size={12} />
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div
          style={{
            background: 'rgba(18, 18, 24, 0.85)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: size.height,
            position: 'relative',
          }}
        >
          {/* Header / drag bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              cursor: 'grab',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Zap size={13} style={{ color: '#9b84ec' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#a1a1aa', letterSpacing: '0.04em' }}>
                QUICK CAPTURE
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              onMouseDown={e => e.stopPropagation()}
              aria-label="Collapse"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#8b8fa3',
                display: 'flex',
                padding: '2px',
                borderRadius: '4px',
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px', gap: '10px', overflow: 'hidden' }}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Capture a thought..."
              style={{
                flex: 1,
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '10px',
                color: '#e4e4e7',
                fontSize: '13px',
                padding: '10px',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                userSelect: 'text',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167, 139, 250, 0.1)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.boxShadow = 'none' }}
            />

            {/* Type selector */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {types.map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    fontSize: '11px',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: '1px solid',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    background: type === t ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                    borderColor: type === t ? 'rgba(167, 139, 250, 0.35)' : 'rgba(255, 255, 255, 0.06)',
                    color: type === t ? '#c4b5fd' : '#71717a',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !content.trim()}
              style={{
                padding: '8px',
                background: flash === 'ok' ? '#16a34a' : flash === 'err' ? '#dc2626' : '#9b84ec',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: saving || !content.trim() ? 'not-allowed' : 'pointer',
                opacity: !content.trim() && !flash ? 0.5 : 1,
                transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                boxShadow: content.trim() ? '0 2px 12px rgba(167, 139, 250, 0.25)' : 'none',
              }}
            >
              {flash === 'ok' ? 'Saved!' : flash === 'err' ? 'Error' : saving ? 'Saving…' : 'Save  ⌘↵'}
            </button>
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={onResizeMouseDown}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '16px',
              height: '16px',
              cursor: 'nwse-resize',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              padding: '3px',
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 7L7 1M4 7L7 4M7 7L7 7" stroke="#8b8fa3" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}
