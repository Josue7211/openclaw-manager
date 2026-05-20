/*
 * Copied/adapted from T3 Code's sidebar thread row/action menu surface.
 * ClawControl passes session callbacks in from Chat.tsx while the row UI lives
 * with the copied project sidebar components.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowsCounterClockwise,
  ClipboardText,
  DotsThreeVertical,
  PencilSimple,
  Trash,
} from '@phosphor-icons/react'
import type { ClaudeSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import { ProjectIconButton, ProjectMenuButton, useDismissibleMenu } from './ProjectSidebarControls'

function formatSessionTime(session: ClaudeSession): string {
  const raw = session.lastActivity
  if (!raw) return ''
  const timestamp = new Date(raw).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const delta = Date.now() - timestamp
  if (delta < 60_000) return 'now'
  if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m`
  if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))}h`
  return `${Math.max(1, Math.round(delta / 86_400_000))}d`
}

export function ProjectSidebarThread({
  session,
  selected,
  onSelect,
  onRename,
  onDelete,
  onCompact,
  onCopyThreadId,
  isCompacting = false,
  copiedThreadId = false,
  copyThreadError = false,
  compact = false,
}: {
  session: ClaudeSession
  selected: boolean
  onSelect: () => void
  onRename: (key: string, label: string) => void
  onDelete: (key: string) => void
  onCompact: (key: string) => void
  onCopyThreadId: (session: ClaudeSession) => void
  isCompacting?: boolean
  copiedThreadId?: boolean
  copyThreadError?: boolean
  compact?: boolean
}) {
  const label = (session.label as string) || 'Untitled'
  const messageCount = Number(session.messageCount || 0)
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [draftLabel, setDraftLabel] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)
  const actionsMenuRef = useDismissibleMenu(actionsOpen, setActionsOpen)

  const closeActionsMenu = () => {
    setActionsOpen(false)
  }

  useEffect(() => {
    if (!editing) setDraftLabel(label)
  }, [editing, label])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commitRename = () => {
    const nextLabel = draftLabel.trim()
    if (nextLabel && nextLabel !== label) {
      onRename(session.key, nextLabel)
    }
    setEditing(false)
  }

  return (
    <div
      role="option"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHovered(false)
        }
      }}
      aria-selected={selected}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${label}, ${messageCount} message${messageCount === 1 ? '' : 's'}`}
      data-t3-project-sidebar-thread
      className="hover-bg"
      style={{
        minHeight: compact ? 28 : 36,
        border: 'none',
        borderRadius: 8,
        background: selected ? 'var(--active-bg)' : 'transparent',
        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'center',
        padding: compact ? '3px 8px' : '6px 10px',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        width: '100%',
        position: 'relative',
      }}
    >
      <span style={{ minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draftLabel}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraftLabel(label)
                setEditing(false)
              }
            }}
            aria-label={`Rename ${label}`}
            style={{
              width: '100%',
              minWidth: 0,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--bg-base)',
              color: 'var(--text-primary)',
              font: 'inherit',
              fontSize: compact ? 12 : 13,
              padding: '2px 4px',
            }}
          />
        ) : (
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: compact ? 12 : 13, fontWeight: selected ? 700 : 500 }}>
            {label}
          </span>
        )}
        {!compact && (
          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>
            {messageCount} message{messageCount === 1 ? '' : 's'}
          </span>
        )}
      </span>
      <span style={{
        color: 'var(--text-muted)',
        fontSize: 11,
        opacity: hovered || editing ? 0 : 1,
        transition: 'opacity 0.12s',
      }}>
        {formatSessionTime(session)}
      </span>
      <span
        style={{
          position: 'absolute',
          right: 4,
          top: compact ? 2 : 5,
          display: 'flex',
          gap: 2,
          opacity: hovered || editing || actionsOpen ? 1 : 0,
          pointerEvents: hovered || editing || actionsOpen ? 'auto' : 'none',
          transition: 'opacity 0.12s',
        }}
      >
        <div
          ref={actionsMenuRef}
          style={{ position: 'relative', width: 22, height: 22 }}
          onClick={(event) => event.stopPropagation()}
        >
          <ProjectIconButton
            label={`More actions for ${label}`}
            onClick={() => setActionsOpen((current) => !current)}
            active={actionsOpen}
          >
            <DotsThreeVertical size={13} />
          </ProjectIconButton>
          {actionsOpen && (
            <div
              role="menu"
              aria-label={`Actions for ${label}`}
              data-t3-project-sidebar-thread-menu
              style={{
                position: 'absolute',
                zIndex: 20,
                right: 0,
                top: 25,
                width: 190,
                display: 'grid',
                gap: 3,
                padding: 5,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--bg-panel)',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
              }}
            >
              <ProjectMenuButton
                label={copiedThreadId ? `Copied thread id for ${label}` : `Copy thread id for ${label}`}
                active={copiedThreadId}
                danger={copyThreadError}
                icon={<ClipboardText size={13} />}
                onClick={() => {
                  onCopyThreadId(session)
                  closeActionsMenu()
                }}
              />
              <ProjectMenuButton
                label={`Rename ${label}`}
                icon={<PencilSimple size={13} />}
                onClick={() => {
                  setEditing(true)
                  closeActionsMenu()
                }}
              />
              <ProjectMenuButton
                label={`Compact ${label}`}
                icon={<ArrowsCounterClockwise size={13} />}
                disabled={isCompacting}
                onClick={() => {
                  onCompact(session.key)
                  closeActionsMenu()
                }}
              />
              <ProjectMenuButton
                label={`Delete ${label}`}
                danger
                icon={<Trash size={13} />}
                onClick={() => {
                  onDelete(session.key)
                  closeActionsMenu()
                }}
              />
            </div>
          )}
        </div>
      </span>
    </div>
  )
}

export function ProjectSidebarEmpty({ children }: { children: ReactNode }) {
  return (
    <div style={{ height: 26, display: 'flex', alignItems: 'center', padding: '0 10px', color: 'var(--text-muted)', fontSize: 12 }}>
      {children}
    </div>
  )
}
