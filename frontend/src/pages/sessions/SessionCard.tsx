import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  PencilSimple,
  Trash,
  ArrowsCounterClockwise,
  DotsThree,
} from '@phosphor-icons/react'
import SecondsAgo from '@/components/SecondsAgo'
import type { ClaudeSession } from './types'

interface SessionCardProps {
  session: ClaudeSession
  selected: boolean
  onSelect: () => void
  onRename: (key: string, label: string) => void
  onDelete: (key: string) => void
  onCompact: (key: string) => void
  isCompacting?: boolean
}

function ContextMenu({
  x,
  y,
  onRename,
  onCompact,
  onDelete,
  onClose,
}: {
  x: number
  y: number
  onRename: () => void
  onCompact: () => void
  onDelete: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const menuX = Math.min(x, window.innerWidth - 200)
  const menuY = Math.min(y, window.innerHeight - 160)

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'transparent',
        }}
      />
      {/* Menu */}
      <div
        role="menu"
        style={{
          position: 'fixed',
          left: menuX,
          top: menuY,
          zIndex: 10000,
          minWidth: 170,
          padding: '4px',
          borderRadius: '10px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <MenuButton icon={<PencilSimple size={15} />} label="Rename" onClick={() => { onClose(); onRename() }} />
        <MenuButton icon={<ArrowsCounterClockwise size={15} />} label="Compact" onClick={() => { onClose(); onCompact() }} />
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        <MenuButton
          icon={<Trash size={15} />}
          label="Delete"
          onClick={() => { onClose(); onDelete() }}
          danger
        />
      </div>
    </>,
    document.body,
  )
}

function MenuButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 10px',
        border: 'none',
        borderRadius: '6px',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: '13px',
        color: danger ? 'var(--red-500)' : 'var(--text-primary)',
        fontFamily: 'inherit',
        width: '100%',
        textAlign: 'left',
      }}
      className="hover-bg"
    >
      {icon}
      {label}
    </button>
  )
}

export const SessionCard = React.memo(function SessionCard({
  session,
  selected,
  onSelect,
  onRename,
  onDelete,
  onCompact,
  isCompacting,
}: SessionCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dotsRef = useRef<HTMLButtonElement>(null)

  const lastActivityMs = session.lastActivity
    ? new Date(session.lastActivity as string).getTime()
    : Date.now()

  const sessionLabel = (session.label as string) || 'Untitled'

  const commitRename = () => {
    const trimmed = draftLabel.trim()
    if (trimmed && trimmed !== sessionLabel) {
      onRename(session.key as string, trimmed)
    }
    setIsEditing(false)
  }

  const startEditing = () => {
    setDraftLabel(sessionLabel)
    setIsEditing(true)
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setMenuPos({ x: e.clientX, y: e.clientY })
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: selected ? 'var(--active-bg)' : 'var(--bg-card)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${selected ? 'var(--accent)44' : 'var(--border)'}`,
          borderRadius: '16px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'border-color 0.3s, background 0.15s',
          fontFamily: 'inherit',
          color: 'inherit',
          position: 'relative',
        }}
      >
        {/* Three-dot menu button */}
        <button
          ref={dotsRef}
          type="button"
          aria-label="Session actions"
          onClick={(e) => {
            e.stopPropagation()
            const rect = (e.target as HTMLElement).getBoundingClientRect()
            setMenuPos({ x: rect.right, y: rect.bottom + 4 })
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: '6px',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            opacity: hovered || menuPos ? 1 : 0,
            transition: 'opacity 0.15s',
            padding: 0,
          }}
          className="hover-bg"
        >
          <DotsThree size={16} weight="bold" />
        </button>

        {/* Label */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              }
              if (e.key === 'Escape') {
                setDraftLabel(sessionLabel)
                setIsEditing(false)
              }
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            aria-label="Rename session"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              width: '100%',
              background: 'transparent',
              border: '1px solid var(--accent)',
              borderRadius: '4px',
              padding: '2px 4px',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation()
              startEditing()
            }}
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingRight: 24,
            }}
          >
            {sessionLabel}
          </div>
        )}

        {/* Agent key */}
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {session.agentKey as string}
        </div>

        {/* Message count + timestamp row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}>
          <span>
            {isCompacting ? (
              <span style={{ color: 'var(--accent)' }}>Compacting...</span>
            ) : (
              `${session.messageCount as number} messages`
            )}
          </span>
          <SecondsAgo sinceMs={lastActivityMs} />
        </div>
      </button>

      {/* Context menu */}
      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          onRename={startEditing}
          onCompact={() => onCompact(session.key as string)}
          onDelete={() => onDelete(session.key as string)}
          onClose={() => setMenuPos(null)}
        />
      )}
    </>
  )
})
