/*
 * Copied/adapted from T3 Code's sidebar thread row/action menu surface.
 * ClawControl passes session callbacks in from Chat.tsx while the row UI lives
 * with the copied project sidebar components.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowsCounterClockwise,
  ClipboardText,
  DotsThreeVertical,
  PencilSimple,
  PushPin,
  Trash,
} from '@phosphor-icons/react'
import type { HermesSession } from '@/chat/t3-adapters/gatewaySessionTypes'
import { ProjectIconButton, ProjectMenuButton, useDismissibleMenu } from './ProjectSidebarControls'

const opaqueThreadMenuPanelStyle = {
  background: '#18181f',
  backgroundColor: '#18181f',
  opacity: 1,
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  backgroundClip: 'padding-box',
  isolation: 'isolate',
} as const
const PROJECT_MENU_Z_INDEX = 10000

function formatSessionTime(session: HermesSession): string {
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
  onPin,
  onCompact,
  onCopyThreadId,
  isCompacting = false,
  copiedThreadId = false,
  copyThreadError = false,
  compact = false,
}: {
  session: HermesSession
  selected: boolean
  onSelect: () => void
  onRename: (key: string, label: string, environmentId?: string | null) => void
  onDelete: (key: string, environmentId?: string | null) => void
  onPin: (key: string, pinned: boolean, environmentId?: string | null) => void
  onCompact: (key: string, environmentId?: string | null) => void
  onCopyThreadId: (session: HermesSession) => void
  isCompacting?: boolean
  copiedThreadId?: boolean
  copyThreadError?: boolean
  compact?: boolean
}) {
  const label = (session.label as string) || 'Untitled'
  const messageCount = Number(session.messageCount || 0)
  const pinned = session.pinned === true || session.favorite === true
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 190 })
  const [draftLabel, setDraftLabel] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const floatingMenuRef = useRef<HTMLDivElement | null>(null)
  const actionsMenuRef = useDismissibleMenu(actionsOpen, setActionsOpen, floatingMenuRef)
  const menuWidth = 190

  const closeActionsMenu = () => {
    setActionsOpen(false)
  }

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return
    const rect = trigger.getBoundingClientRect()
    const gutter = 8
    const availableWidth = Math.max(120, window.innerWidth - gutter * 2)
    const width = Math.min(menuWidth, availableWidth)
    const renderedHeight = floatingMenuRef.current?.offsetHeight || 142
    const maxLeft = Math.max(gutter, window.innerWidth - width - gutter)
    const left = Math.min(Math.max(gutter, rect.right - width), maxLeft)
    const hasRoomBelow = rect.bottom + 4 + renderedHeight <= window.innerHeight - gutter
    const unclampedTop = hasRoomBelow ? rect.bottom + 4 : rect.top - renderedHeight - 4
    const maxTop = Math.max(gutter, window.innerHeight - renderedHeight - gutter)
    const top = Math.min(Math.max(gutter, unclampedTop), maxTop)
    setMenuPosition({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (actionsOpen) updateMenuPosition()
  }, [actionsOpen, updateMenuPosition])

  useEffect(() => {
    if (!actionsOpen) return
    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [actionsOpen, updateMenuPosition])

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
      onRename(session.key, nextLabel, session.environmentId ?? null)
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
      data-selected={selected ? 'true' : 'false'}
      className="hover-bg chat-sidebar-selectable chat-sidebar-thread-row"
      style={{
        minHeight: compact ? 28 : 36,
        border: 'none',
        borderRadius: 8,
        background: 'transparent',
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
            buttonRef={triggerRef}
            label={`More actions for ${label}`}
            onClick={() => setActionsOpen((current) => !current)}
            active={actionsOpen}
          >
            <DotsThreeVertical size={13} />
          </ProjectIconButton>
          {actionsOpen && createPortal(
            <div
              ref={floatingMenuRef}
              role="menu"
              aria-label={`Actions for ${label}`}
              data-t3-project-sidebar-thread-menu
              style={{
                position: 'fixed',
                zIndex: PROJECT_MENU_Z_INDEX,
                left: menuPosition.left,
                top: menuPosition.top,
                width: menuPosition.width,
                maxHeight: 'min(320px, calc(100vh - 16px))',
                overflowY: 'auto',
                display: 'grid',
                gap: 3,
                padding: 5,
                border: '1px solid var(--border-strong, var(--border))',
                borderRadius: 8,
                ...opaqueThreadMenuPanelStyle,
                boxShadow: '0 18px 42px rgba(0, 0, 0, 0.56), 0 0 0 1px rgba(255, 255, 255, 0.04)',
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
                label={`Rename chat ${label}`}
                icon={<PencilSimple size={13} />}
                onClick={() => {
                  setEditing(true)
                  closeActionsMenu()
                }}
              />
              <ProjectMenuButton
                label={pinned ? `Unpin chat ${label}` : `Pin chat ${label}`}
                active={pinned}
                icon={<PushPin size={13} />}
                onClick={() => {
                  onPin(session.key, !pinned, session.environmentId ?? null)
                  closeActionsMenu()
                }}
              />
              <ProjectMenuButton
                label={`Compact chat ${label}`}
                icon={<ArrowsCounterClockwise size={13} />}
                disabled={isCompacting}
                onClick={() => {
                  onCompact(session.key, session.environmentId ?? null)
                  closeActionsMenu()
                }}
              />
              <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
              <ProjectMenuButton
                label={`Delete chat ${label}`}
                danger
                icon={<Trash size={13} />}
                onClick={() => {
                  onDelete(session.key, session.environmentId ?? null)
                  closeActionsMenu()
                }}
              />
            </div>,
            document.body,
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
