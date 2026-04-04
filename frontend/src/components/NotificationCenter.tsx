import React, { useState, useCallback, useEffect, useRef, useMemo, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, X, Checks, ChatText, Warning, Info, CaretDown, CaretRight } from '@phosphor-icons/react'

/* ─── Types ──────────────────────────────────────────────────────────────── */

type NotificationType = 'message' | 'system' | 'alert'

interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  timestamp: number
  read: boolean
  /** Optional route to navigate to when clicked */
  route?: string
}

/** A group of consecutive same-sender notifications, or a single standalone one */
interface NotificationGroup {
  key: string
  sender: string
  type: NotificationType
  items: Notification[]
  latestTimestamp: number
  route?: string
  hasUnread: boolean
}

/* ─── Module-level store (useSyncExternalStore) ──────────────────────────── */

const MAX_NOTIFICATIONS = 50

let notifications: Notification[] = []
let listeners: Set<() => void> = new Set()

function emitChange() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): Notification[] {
  return notifications
}

let unreadCount = 0
function getUnreadSnapshot(): number {
  return unreadCount
}

function recalcUnread() {
  unreadCount = notifications.filter(n => !n.read).length
}

/**
 * Add a notification to the in-memory store.
 * Other components can import and call this directly.
 */
export function addNotification(
  type: NotificationType,
  title: string,
  body: string,
  route?: string,
) {
  const notification: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    body,
    timestamp: Date.now(),
    read: false,
    route,
  }
  // Prepend (newest first), enforce FIFO cap
  notifications = [notification, ...notifications].slice(0, MAX_NOTIFICATIONS)
  recalcUnread()
  emitChange()
}

export function markAllRead() {
  notifications = notifications.map(n => n.read ? n : { ...n, read: true })
  recalcUnread()
  emitChange()
}

function markRead(id: string) {
  notifications = notifications.map(n => n.id === id ? { ...n, read: true } : n)
  recalcUnread()
  emitChange()
}

function clearNotifications() {
  notifications = []
  recalcUnread()
  emitChange()
}

/* ─── Hook for consuming notifications ───────────────────────────────────── */

function useNotifications() {
  const items = useSyncExternalStore(subscribe, getSnapshot)
  const unread = useSyncExternalStore(subscribe, getUnreadSnapshot)
  return { notifications: items, unreadCount: unread }
}

/* ─── Grouping logic ─────────────────────────────────────────────────────── */

/**
 * Groups consecutive notifications that share the same sender (title) and type.
 * Non-consecutive same-sender items remain in separate groups.
 */
function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = []
  for (const notif of items) {
    const last = groups[groups.length - 1]
    if (last && last.sender === notif.title && last.type === notif.type) {
      last.items.push(notif)
      // latestTimestamp stays as the first item's (newest, since list is newest-first)
      if (!notif.read) last.hasUnread = true
    } else {
      groups.push({
        key: notif.id,
        sender: notif.title,
        type: notif.type,
        items: [notif],
        latestTimestamp: notif.timestamp,
        route: notif.route,
        hasUnread: !notif.read,
      })
    }
  }
  return groups
}

/* ─── Icon helper ────────────────────────────────────────────────────────── */

function TypeIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case 'message': return <ChatText size={14} style={{ color: 'var(--blue)', flexShrink: 0 }} />
    case 'alert': return <Warning size={14} style={{ color: 'var(--amber)', flexShrink: 0 }} />
    case 'system': return <Info size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
  }
}

function relativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/* ─── Bell button (for sidebar) ──────────────────────────────────────────── */

export function NotificationBell({ collapsed, textOpacity = 1 }: { collapsed: boolean; textOpacity?: number }) {
  const { unreadCount } = useNotifications()
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState<{ bottom: number; left: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        ref={btnRef}
        data-testid="notification-bell"
        onClick={() => {
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            setPanelPos({
              bottom: window.innerHeight - rect.top + 8,
              left: rect.right + 8,
            })
          }
          setOpen(o => !o)
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        title={collapsed ? 'Notifications' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: collapsed ? '10px 0' : '9px 16px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: open ? 'var(--active-bg)' : 'transparent',
          border: 'none',
          borderRadius: '10px',
          color: open ? 'var(--text-on-color)' : 'var(--text-secondary)',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.25s var(--ease-spring)',
          fontSize: '13px',
          fontWeight: open ? 600 : 450,
          textAlign: 'left',
          outline: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
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
        <Bell size={16} style={{ flexShrink: 0 }} />
        {!collapsed && <span style={{ opacity: textOpacity, overflow: 'hidden', textOverflow: 'ellipsis' }}>Notifications</span>}
        <span aria-live="polite" aria-atomic="true" style={{ display: 'contents' }}>
          {unreadCount > 0 && (
            collapsed ? (
              <span style={{
                position: 'absolute',
                top: '6px',
                right: collapsed ? '16px' : undefined,
                width: '8px',
                height: '8px',
                background: 'var(--red)',
                borderRadius: '50%',
                border: '2px solid var(--glass-bg)',
              }} />
            ) : (
              <span style={{
                marginLeft: 'auto',
                minWidth: '18px',
                height: '18px',
                background: 'var(--red)',
                borderRadius: '9px',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-on-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                flexShrink: 0,
                padding: '0 5px',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )
          )}
        </span>
      </button>

      {open && panelPos && createPortal(
        <NotificationPanel
          ref={panelRef}
          onClose={() => setOpen(false)}
          position={panelPos}
        />,
        document.body
      )}
    </div>
  )
}

/* ─── Single notification row ────────────────────────────────────────────── */

const NotificationRow = React.memo(function NotificationRow({
  notif,
  onClick,
  indent = false,
}: {
  notif: Notification
  onClick: (n: Notification) => void
  indent?: boolean
}) {
  return (
    <button
      onClick={() => onClick(notif)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        width: '100%',
        padding: indent ? '6px 14px 6px 40px' : '10px 14px',
        background: notif.read ? 'transparent' : 'var(--blue-a04)',
        border: 'none',
        borderBottom: '1px solid var(--bg-white-04)',
        cursor: notif.route ? 'pointer' : 'default',
        textAlign: 'left',
        transition: 'background 0.15s ease, transform 0.15s ease',
        color: 'inherit',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--active-bg)'
        if (notif.route) e.currentTarget.style.transform = 'translateX(2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = notif.read ? 'transparent' : 'var(--blue-a04)'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
    >
      {/* Unread dot + icon */}
      {!indent && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingTop: '2px',
          flexShrink: 0,
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: notif.read ? 'transparent' : 'var(--blue)',
            flexShrink: 0,
            animation: notif.read ? 'none' : 'unreadPulse 2s ease-in-out infinite',
          }} />
          <TypeIcon type={notif.type} />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '8px',
        }}>
          <span style={{
            fontSize: indent ? '11px' : '12px',
            fontWeight: notif.read ? 500 : 600,
            color: notif.read ? 'var(--text-secondary)' : 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {indent ? notif.body : notif.title}
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {relativeTime(notif.timestamp)}
          </span>
        </div>
        {!indent && (
          <div style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {notif.body}
          </div>
        )}
      </div>
    </button>
  )
})

/* ─── Grouped notification row ───────────────────────────────────────────── */

const GroupedNotificationRow = React.memo(function GroupedNotificationRow({
  group,
  onClickItem,
}: {
  group: NotificationGroup
  onClickItem: (n: Notification) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const count = group.items.length
  const latest = group.items[0] // newest first

  const handleHeaderClick = () => {
    if (expanded) {
      setExpanded(false)
    } else {
      setExpanded(true)
    }
  }

  const handleNavigate = () => {
    // Mark all in group as read
    for (const item of group.items) {
      if (!item.read) markRead(item.id)
    }
    if (group.route) {
      navigate(group.route)
    }
  }

  return (
    <div>
      {/* Group header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          width: '100%',
          padding: '10px 14px',
          background: group.hasUnread ? 'var(--blue-a04)' : 'transparent',
          borderBottom: '1px solid var(--bg-white-04)',
          textAlign: 'left',
          transition: 'background 0.15s ease',
          color: 'inherit',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--bg-white-04)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = group.hasUnread ? 'var(--blue-a04)' : 'transparent'
        }}
      >
        {/* Unread dot + icon */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingTop: '2px',
          flexShrink: 0,
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: group.hasUnread ? 'var(--blue)' : 'transparent',
            flexShrink: 0,
            animation: group.hasUnread ? 'unreadPulse 2s ease-in-out infinite' : 'none',
          }} />
          <TypeIcon type={group.type} />
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0 }} onClick={handleNavigate}>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '8px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflow: 'hidden',
            }}>
              <span style={{
                fontSize: '12px',
                fontWeight: group.hasUnread ? 600 : 500,
                color: group.hasUnread ? 'var(--text-primary)' : 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {group.sender}
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--blue)',
                background: 'var(--blue-a08)',
                padding: '1px 6px',
                borderRadius: '8px',
                flexShrink: 0,
                lineHeight: '16px',
              }}>
                {count}
              </span>
            </div>
            <span style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {relativeTime(group.latestTimestamp)}
            </span>
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {latest.body}
          </div>
        </div>

        {/* Expand/collapse chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleHeaderClick()
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
            marginTop: '1px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--hover-bg-bright)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          aria-label={expanded ? 'Collapse messages' : 'Expand messages'}
        >
          {expanded
            ? <CaretDown size={13} />
            : <CaretRight size={13} />}
        </button>
      </div>

      {/* Expanded individual items */}
      {expanded && (
        <div style={{
          background: 'var(--overlay-light)',
          borderBottom: '1px solid var(--bg-white-04)',
        }}>
          {group.items.map(notif => (
            <NotificationRow
              key={notif.id}
              notif={notif}
              onClick={onClickItem}
              indent
            />
          ))}
        </div>
      )}
    </div>
  )
})

/* ─── Notification panel dropdown ────────────────────────────────────────── */

import { forwardRef } from 'react'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'

const NotificationPanel = forwardRef<HTMLDivElement, { onClose: () => void; position: { bottom: number; left: number } }>(
  function NotificationPanel({ onClose, position }, ref) {
    const trapRef = useFocusTrap(true)
    const mergedRef = useCallback((node: HTMLDivElement | null) => {
      // Assign to forwardRef
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
      // Assign to focus trap ref
      ;(trapRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    }, [ref, trapRef])

    const { notifications, unreadCount } = useNotifications()
    const navigate = useNavigate()

    const groups = useMemo(() => groupNotifications(notifications), [notifications])

    const handleClick = useCallback((notif: Notification) => {
      markRead(notif.id)
      if (notif.route) {
        navigate(notif.route)
        onClose()
      }
    }, [navigate, onClose])

    return (
      <>
      <div
        ref={mergedRef}
        role="dialog"
        aria-label="Notifications"
        style={{
          position: 'fixed',
          bottom: `${position.bottom}px`,
          left: `${position.left}px`,
          width: '340px',
          maxHeight: '460px',
          background: 'var(--bg-modal)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid var(--border-hover)',
          borderRadius: '12px',
          boxShadow: '0 16px 48px var(--overlay), 0 0 0 1px var(--hover-bg) inset',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'notifPanelIn 0.2s var(--ease-spring)',
          transformOrigin: 'bottom left',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--active-bg)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--blue)',
                background: 'var(--blue-a08)',
                padding: '2px 6px',
                borderRadius: '10px',
              }}>
                {unreadCount} new
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                title="Mark all read"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--active-bg)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                <Checks size={12} />
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--active-bg)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div
          aria-live="polite"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {notifications.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              color: 'var(--text-muted)',
              gap: '8px',
            }}>
              <Bell size={24} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '12px' }}>No notifications</span>
            </div>
          ) : (
            groups.map(group =>
              group.items.length === 1 ? (
                <NotificationRow
                  key={group.key}
                  notif={group.items[0]}
                  onClick={handleClick}
                />
              ) : (
                <GroupedNotificationRow
                  key={group.key}
                  group={group}
                  onClickItem={handleClick}
                />
              )
            )
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--active-bg)',
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <button
              onClick={() => { clearNotifications(); onClose() }}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.background = 'var(--bg-white-04)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>
      </>
    )
  }
)
