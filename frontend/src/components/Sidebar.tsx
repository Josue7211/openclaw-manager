import React, { useState, useCallback, useRef, useMemo, useSyncExternalStore, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CaretRight, CaretDown, Gear, Plus, Note, CheckSquare, Lightbulb, Flag, FileText, ArrowUp, ArrowDown, PencilSimple, Trash, FolderPlus, EyeSlash, Palette, X } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import GlobalSearch from './GlobalSearch'
import { NotificationBell } from './NotificationCenter'
import { StatusBar } from './StatusBar'
import { ContextMenu, type ContextMenuState, type ContextMenuItem } from './ContextMenu'
import { type NavItem, navItemsByHref } from '@/lib/nav-items'
import { subscribeSidebarSettings, getSidebarHeaderVisible, getSidebarDefaultWidth, setSidebarDefaultWidth, getSidebarTitleLayout, getSidebarTitleText, getSidebarSearchVisible, getSidebarLogoVisible, getSidebarTitleSize } from '@/lib/sidebar-settings'
import { subscribeModules, getEnabledModules } from '@/lib/modules'
import {
  getSidebarConfig, setSidebarConfig, subscribeSidebarConfig,
  setCategoryCollapsed,
  moveItem, renameItem, renameCategory, createCustomModule, softDeleteItem,
} from '@/lib/sidebar-config'
import { useUnreadCounts, markRead } from '@/lib/unread-store'
import { getDashboardState, subscribeDashboard, setActivePage } from '@/lib/dashboard-store'
import { queryKeys } from '@/lib/query-keys'
import { api } from '@/lib/api'
import { BUILT_IN_THEMES } from '@/lib/theme-definitions'
import {
  useThemeState,
  setPageOverride,
  clearPageOverride,
  setCategoryOverride,
  clearCategoryOverride,
} from '@/lib/theme-store'

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SidebarProps {
  width: number
  onWidthChange: (w: number) => void
  draggingRef: React.MutableRefObject<boolean>
}

type CaptureType = 'note' | 'task' | 'idea' | 'decision'

const CAPTURE_TYPES: { type: CaptureType; label: string; icon: React.ElementType }[] = [
  { type: 'note', label: 'Note', icon: Note },
  { type: 'task', label: 'Task', icon: CheckSquare },
  { type: 'idea', label: 'Idea', icon: Lightbulb },
  { type: 'decision', label: 'Decision', icon: Flag },
]

const PREFETCH_ROUTES: Record<string, { key: readonly string[]; path: string }> = {
  '/': { key: queryKeys.todos, path: '/api/todos' },
  '/missions': { key: queryKeys.missions, path: '/api/missions' },
  '/settings': { key: queryKeys.prefs, path: '/api/prefs' },
}

/* ─── Stable style objects (hoisted to module level to avoid re-creation) ── */

const logoStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '45px',
  height: '45px',
  minWidth: '45px',
  WebkitMaskImage: 'url(/logo-128.png)',
  WebkitMaskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskImage: 'url(/logo-128.png)',
  maskSize: 'contain',
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
  background: 'var(--logo-color)',
  filter: 'drop-shadow(0 2px 8px var(--logo-color))',
} as React.CSSProperties

const resizeHandleStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: '8px',
  height: '100%',
  cursor: 'col-resize',
  zIndex: 10,
  opacity: 0,
  transition: 'opacity var(--duration-fast) ease',
}

const plusIconStyle: React.CSSProperties = { flexShrink: 0 }
const settingsIconStyle: React.CSSProperties = { flexShrink: 0 }
const overflowHiddenStyle: React.CSSProperties = { overflow: 'hidden' }

const sectionLabelBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  borderRadius: '8px',
  transition: `color var(--duration-fast)`,
  whiteSpace: 'nowrap',
}

const editingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '5px 16px',
  borderRadius: '10px',
  marginBottom: '2px',
  background: 'var(--active-bg)',
}

const editingInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--accent)',
  color: 'var(--text-on-color)',
  fontSize: '13px',
  fontWeight: 600,
  outline: 'none',
  padding: '4px 0',
  minWidth: 0,
  fontFamily: 'inherit',
}

const catRenameInputStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--accent)',
  color: 'var(--text-primary)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  outline: 'none',
  padding: '2px 0',
  width: '100%',
  fontFamily: 'inherit',
}

/* ─── NavSection (memoized) ──────────────────────────────────────────────── */

const NavSection = React.memo(function NavSection({
  label,
  items,
  pathname,
  collapsed,
  textOpacity: _textOpacity,
  width,
  open,
  onToggle,
  onHoverItem,
  isDragging,
  delayOffset = 0,
  categoryId,
  onItemContextMenu,
  onCategoryContextMenu,
  editingHref,
  editingValue,
  onEditingChange: _onEditingChange,
  onEditingComplete,
  onEditingCancel,
  onDragStart: onItemDragStart,
  onDragOver: onItemDragOver,
  onDrop: onItemDrop,
  onDragEnd: onItemDragEnd,
  dragOverIdx,
  dragHref,
  overrideColors,
  categoryOverrideColor,
  unreadCounts,
}: {
  label: string
  items: NavItem[]
  pathname: string
  collapsed: boolean
  textOpacity: number
  width: number
  open: boolean
  onToggle: () => void
  onHoverItem: (href: string) => void
  isDragging: boolean
  delayOffset?: number
  categoryId?: string
  onItemContextMenu?: (href: string, catId: string, e: React.MouseEvent) => void
  onCategoryContextMenu?: (catId: string, e: React.MouseEvent) => void
  editingHref?: string | null
  editingValue?: string
  onEditingChange?: (v: string) => void
  onEditingComplete?: (val?: string) => void
  onEditingCancel?: () => void
  // Drag-to-reorder
  onDragStart?: (href: string, catId: string) => void
  onDragOver?: (catId: string, idx: number) => void
  onDrop?: (catId: string, idx: number) => void
  onDragEnd?: () => void
  dragOverIdx?: number | null
  dragHref?: string | null
  /** Map of href -> accent color for items with page theme overrides */
  overrideColors?: Record<string, string>
  /** Accent color for category override indicator */
  categoryOverrideColor?: string
  /** Map of href -> unread count for badge rendering */
  unreadCounts?: Record<string, number>
}) {
  // Typewriter effect — calculate chars that physically fit in available space
  const labelCharWidth = 7 // ~10px uppercase font + letter-spacing
  const labelAvailable = Math.max(0, width - 40) // sidebar minus container + button padding
  const labelCharsVisible = Math.min(label.length, Math.floor(labelAvailable / labelCharWidth))
  const labelText = label.slice(0, labelCharsVisible)
  const labelIsTyping = labelCharsVisible > 0 && labelCharsVisible < label.length
  const chevronOpacity = Math.min(1, Math.max(0, (width - 180) / 40))
  // Activity indicator for collapsed categories with unread children
  const hasUnreadChild = !open && items.some(item => (unreadCounts?.[item.href] || 0) > 0)
  // Slide up only during snap (80→64), not while manually resizing
  const labelOpacity = width >= 80 ? 1 : width <= 64 ? 0 : (width - 64) / 16
  const labelHeight = width >= 80 ? 36 : width <= 64 ? 0 : ((width - 64) / 16) * 36

  return (
    <div style={{ marginBottom: collapsed ? '2px' : '4px' }}>
      {/* Section label — slides up like search bar below 130px; hidden for standalone items */}
      {label ? <div style={{
        height: `${labelHeight}px`,
        opacity: labelOpacity,
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
      }}>
        <button
          onClick={onToggle}
          onContextMenu={categoryId && onCategoryContextMenu ? (e) => { e.preventDefault(); onCategoryContextMenu(categoryId, e) } : undefined}
          style={sectionLabelBtnStyle}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>
              {labelText}
              {labelIsTyping && <span className="type-cursor">|</span>}
            </span>
            {categoryOverrideColor && (
              <span
                title="Category theme override active"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: categoryOverrideColor,
                  flexShrink: 0,
                }}
              />
            )}
            {hasUnreadChild && (
              <span
                title="New activity in this category"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  flexShrink: 0,
                }}
              />
            )}
          </span>
          {chevronOpacity > 0 && (
            <span style={{
              transition: isDragging ? 'none' : 'transform 0.3s var(--ease-spring), opacity 0.2s ease',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              display: 'flex',
              opacity: chevronOpacity,
            }}>
              <CaretDown size={12} />
            </span>
          )}
        </button>
      </div> : null}
      <div style={{
        display: 'grid',
        gridTemplateRows: (open || collapsed) ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--duration-normal) var(--ease-spring)',
        overflow: 'hidden',
      }}>
        <div style={overflowHiddenStyle}>
          {items.map(({ href, label: itemLabel, icon: Icon }, idx) => {
            const active = pathname === href
            const isEditing = editingHref === href
            const isBeingDragged = dragHref === href
            const showDropBefore = dragOverIdx === idx && dragHref !== href
            const showDropAfter = dragOverIdx === items.length && idx === items.length - 1 && dragHref !== href
            // Typewriter: calculate chars that fit in available space
            const navCharWidth = 8 // ~13px font
            const navTextAvailable = Math.max(0, width - 58) // padding(32) + icon(16) + gap(10)
            const navCharsVisible = Math.min(itemLabel.length, Math.floor(navTextAvailable / navCharWidth))
            const navText = itemLabel.slice(0, navCharsVisible)
            const navIsTyping = navCharsVisible > 0 && navCharsVisible < itemLabel.length

            if (isEditing) {
              return (
                <div
                  key={href}
                  style={editingRowStyle}
                >
                  <Icon size={16} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                  <input
                    autoFocus
                    aria-label="Rename sidebar item"
                    defaultValue={editingValue || ''}
                    onBlur={e => onEditingComplete?.(e.currentTarget.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onEditingComplete?.(e.currentTarget.value)
                      if (e.key === 'Escape') onEditingCancel?.()
                    }}
                    style={editingInputStyle}
                  />
                </div>
              )
            }

            const tooltipId = collapsed ? `tooltip-${href.replace(/\//g, '-')}` : undefined

            return (
              <div key={href}>
                {showDropBefore && (
                  <div style={{ height: '2px', background: 'var(--accent)', borderRadius: '1px', margin: '0 12px', boxShadow: '0 0 6px var(--accent)' }} />
                )}
                <Link
                  to={href}
                  data-testid={`nav-${href}`}
                  draggable
                  onDragStart={categoryId && onItemDragStart ? (e) => {
                    e.dataTransfer.setData('text/plain', href)
                    e.dataTransfer.effectAllowed = 'move'
                    onItemDragStart(href, categoryId)
                  } : undefined}
                  onDragOver={categoryId && onItemDragOver ? (e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    // Determine if drop should be before or after this item based on cursor position
                    const rect = e.currentTarget.getBoundingClientRect()
                    const midY = rect.top + rect.height / 2
                    const insertIdx = e.clientY < midY ? idx : idx + 1
                    onItemDragOver(categoryId, insertIdx)
                  } : undefined}
                  onDrop={categoryId && onItemDrop ? (e) => {
                    e.preventDefault()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const midY = rect.top + rect.height / 2
                    const insertIdx = e.clientY < midY ? idx : idx + 1
                    onItemDrop(categoryId, insertIdx)
                  } : undefined}
                  onDragEnd={onItemDragEnd}
                  title={!collapsed && navCharsVisible < itemLabel.length ? itemLabel : undefined}
                  aria-label={collapsed ? itemLabel : undefined}
                  aria-describedby={tooltipId}
                  onClick={() => { markRead(href); onHoverItem(href) }}
                  onMouseEnter={() => onHoverItem(href)}
                  onContextMenu={categoryId && onItemContextMenu ? (e) => { e.preventDefault(); onItemContextMenu(href, categoryId, e) } : undefined}
                  className="hover-bg sidebar-nav-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: collapsed ? '9px 0' : '9px 16px',
                    borderRadius: '10px',
                    marginBottom: '2px',
                    color: active ? 'var(--text-on-color)' : 'var(--text-secondary)',
                    background: active ? 'var(--active-bg)' : 'transparent',
                    border: 'none',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: active ? 600 : 450,
                    transition: isDragging ? 'none' : `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring), transform 0.25s var(--ease-spring)`,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    position: 'relative',
                    animation: `fadeInUp 0.4s var(--ease-spring) ${(delayOffset + idx) * 30}ms both`,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    opacity: isBeingDragged ? 0.3 : 1,
                    pointerEvents: isDragging ? 'none' : 'auto',
                  }}
                >
                  <Icon size={16} style={{
                    flexShrink: 0,
                    transition: `color var(--duration-fast)`,
                  }} />
                  {navCharsVisible > 0 && !collapsed && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                      <span>
                        {navText}
                        {navIsTyping && <span className="type-cursor">|</span>}
                      </span>
                      {overrideColors?.[href] && (
                        <span
                          title="Page theme override active"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: overrideColors[href],
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {(unreadCounts?.[href] || 0) > 0 && (
                        <span
                          className="unread-dot"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--red-500)',
                            flexShrink: 0,
                            marginLeft: 'auto',
                          }}
                        />
                      )}
                    </span>
                  )}
                  {/* Collapsed sidebar unread indicator on the icon */}
                  {(unreadCounts?.[href] || 0) > 0 && collapsed && (
                    <span style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--red-500)',
                    }} />
                  )}
                  {/* Tooltip for collapsed sidebar — positioned to the right of the icon */}
                  {collapsed && (
                    <span
                      id={tooltipId}
                      role="tooltip"
                      className="sidebar-tooltip"
                      style={{
                        position: 'absolute',
                        left: 'calc(100% + 8px)',
                        top: '50%',
                        transform: 'translateY(-50%) translateX(4px)',
                        background: 'var(--bg-card-solid)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 8px',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        zIndex: 200,
                        boxShadow: 'var(--shadow-medium)',
                        opacity: 0,
                        transition: 'opacity 0.15s ease, transform 0.15s ease',
                      }}
                    >
                      {itemLabel}
                    </span>
                  )}
                </Link>
                {showDropAfter && (
                  <div style={{ height: '2px', background: 'var(--accent)', borderRadius: '1px', margin: '0 12px', boxShadow: '0 0 6px var(--accent)' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

/* ─── SidebarQuickCapture (memoized) ─────────────────────────────────────── */

const SidebarQuickCapture = React.memo(function SidebarQuickCapture({
  collapsed,
  textOpacity,
  onOpenChange,
}: {
  collapsed: boolean
  textOpacity: number
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const setOpenAndNotify = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setOpen(prev => {
      const next = typeof v === 'function' ? v(prev) : v
      onOpenChange?.(next)
      return next
    })
  }, [onOpenChange])
  const [captureType, setCaptureType] = useState<CaptureType>('note')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popPos, setPopPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

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
  }, [text, captureType, saving])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      setOpenAndNotify(false)
    }
  }, [handleSave])

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        ref={btnRef}
        data-testid="quick-capture"
        onClick={() => {
          setOpenAndNotify(o => !o)
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
          transition: `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring)`,
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

      {/* Popout capture form — draggable overlay via portal */}
      {open && createPortal(
        <div style={{
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
        }}>
          {/* Draggable title bar */}
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
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '20px', height: '20px', borderRadius: '6px',
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: '14px',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              ×
            </button>
          </div>
          <div style={{ padding: '10px' }}>
          {/* Type selector */}
          <div style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '8px',
          }}>
            {CAPTURE_TYPES.map(({ type, label, icon: CIcon }) => (
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
                  transition: `all var(--duration-fast) var(--ease-spring)`,
                }}
              >
                <CIcon size={11} />
              </button>
            ))}
          </div>
          {/* Input */}
          <div style={{
            display: 'flex',
            gap: '6px',
          }}>
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
                transition: `all var(--duration-fast) var(--ease-spring)`,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
          </div>{/* end padding wrapper */}
        </div>,
        document.body,
      )}
    </div>
  )
})

/* ─── Typewriter title ───────────────────────────────────────────────────── */

const TypewriterTitle = React.memo(function TypewriterTitle({ availableWidth }: { availableWidth: number }) {
  const layout = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleLayout)
  const titleText = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleText)
  const titleSize = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleSize)
  const twoLine = layout === 'two-line'
  const charWidth = Math.round(titleSize * 0.68)

  if (twoLine) {
    const words = titleText.toUpperCase().split(' ')
    const line1 = words[0] || ''
    const line2 = words.slice(1).join(' ') || ''
    // Both lines shrink independently — each uses the full available width
    const maxPerLine = Math.max(0, Math.floor(availableWidth / charWidth))
    const line1Visible = Math.min(line1.length, maxPerLine)
    const line2Visible = Math.min(line2.length, maxPerLine)
    const line1Full = line1Visible === line1.length
    const line2Full = line2Visible === line2.length
    const line1Cursor = line1Visible > 0 && !line1Full
    const line2Cursor = line2Visible > 0 && !line2Full

    if (line1Visible === 0) return null

    return (
      <div style={{
        fontSize: `${titleSize}px`,
        fontWeight: 700,
        fontFamily: "'Bitcount Prop Double', monospace",
        color: 'var(--text-primary)',
        letterSpacing: '0.08em',
        lineHeight: 0.9,
        whiteSpace: 'pre',
        width: 'fit-content',
      }}>
        {line1.slice(0, line1Visible)}
        {line1Cursor && <span className="type-cursor">|</span>}
        {line2Visible > 0 && (
          <>
            {'\n'}
            {line2.slice(0, line2Visible)}
            {line2Cursor && <span className="type-cursor">|</span>}
          </>
        )}
      </div>
    )
  }

  const text = titleText.toUpperCase()
  const visibleCount = Math.min(text.length, Math.max(0, Math.floor(availableWidth / charWidth)))
  const visibleText = text.slice(0, visibleCount)
  const showCursor = visibleCount > 0 && visibleCount < text.length

  if (visibleCount === 0) return null

  return (
    <div style={{
      fontSize: `${titleSize}px`,
      fontWeight: 700,
      fontFamily: "'Bitcount Prop Double', monospace",
      color: 'var(--text-primary)',
      letterSpacing: '0.08em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      width: 'fit-content',
    }}>
      {visibleText}
      {showCursor && <span className="type-cursor">|</span>}
    </div>
  )
})

/* ─── Gradient divider ───────────────────────────────────────────────────── */

const dividerStyle: React.CSSProperties = {
  height: '1px',
  margin: '4px 12px',
  background: 'linear-gradient(to right, transparent, var(--border-hover), transparent)',
}

const fixedDividerStyle: React.CSSProperties = {
  ...dividerStyle,
  flexShrink: 0,
}

const SectionDivider = React.memo(function SectionDivider() {
  return <div style={dividerStyle} />
})

/* ─── ThemeOverrideMenu ──────────────────────────────────────────────────── */

const ThemeOverrideMenu = React.memo(function ThemeOverrideMenu({
  x,
  y,
  type,
  targetId,
  currentOverrideId,
  onClose,
}: {
  x: number
  y: number
  type: 'page' | 'category'
  targetId: string
  currentOverrideId?: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)
    document.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const menuWidth = 200
  const menuItemHeight = 28
  const menuHeight = (BUILT_IN_THEMES.length + 2) * menuItemHeight + 16
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8)
  const adjustedY = Math.min(y, window.innerHeight - Math.min(menuHeight, 400) - 8)

  const handleSelect = (themeId: string) => {
    if (type === 'page') {
      setPageOverride(targetId, themeId)
    } else {
      setCategoryOverride(targetId, themeId)
    }
    onClose()
  }

  const handleClear = () => {
    if (type === 'page') {
      clearPageOverride(targetId)
    } else {
      clearCategoryOverride(targetId)
    }
    onClose()
  }

  const heading = type === 'page' ? 'Theme for this page' : 'Theme for this category'

  return createPortal(
    <div ref={ref} role="menu" style={{
      position: 'fixed',
      left: adjustedX,
      top: adjustedY,
      zIndex: 10001,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '6px',
      minWidth: '180px',
      maxWidth: '220px',
      maxHeight: '400px',
      overflowY: 'auto',
      boxShadow: '0 8px 32px var(--overlay)',
      animation: 'fadeInUp 0.1s ease',
    }}>
      {/* Heading */}
      <div style={{
        fontSize: '10px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        padding: '4px 8px 6px',
      }}>
        {heading}
      </div>

      {/* Global (no override) */}
      <button
        role="menuitemradio"
        aria-checked={!currentOverrideId}
        onClick={() => handleClear()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '5px 8px',
          background: !currentOverrideId ? 'var(--accent-a10, rgba(167, 139, 250, 0.1))' : 'transparent',
          border: 'none',
          borderRadius: '5px',
          color: !currentOverrideId ? 'var(--accent)' : 'var(--text-primary)',
          fontSize: '12px',
          fontWeight: !currentOverrideId ? 600 : 400,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
        onMouseEnter={e => { if (currentOverrideId) (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = !currentOverrideId ? 'var(--accent-a10, rgba(167, 139, 250, 0.1))' : 'transparent' }}
      >
        Use global theme
      </button>

      {/* Separator */}
      <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

      {/* Theme options */}
      {BUILT_IN_THEMES.map(theme => {
        const isSelected = currentOverrideId === theme.id
        return (
          <button
            key={theme.id}
            role="menuitemradio"
            aria-checked={isSelected}
            onClick={() => handleSelect(theme.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '5px 8px',
              background: isSelected ? 'var(--accent-a10, rgba(167, 139, 250, 0.1))' : 'transparent',
              border: 'none',
              borderRadius: '5px',
              color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: isSelected ? 600 : 400,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'var(--accent-a10, rgba(167, 139, 250, 0.1))' : 'transparent' }}
          >
            {/* Color dot */}
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: theme.colors['accent'] || '#a78bfa',
              flexShrink: 0,
            }} />
            {theme.name}
          </button>
        )
      })}
    </div>,
    document.body,
  )
})

/* ─── Main Sidebar ───────────────────────────────────────────────────────── */

export default function Sidebar({ width, onWidthChange, draggingRef }: SidebarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [isDragging, setIsDragging] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  // Theme override submenu state
  const [themeOverrideMenu, setThemeOverrideMenu] = useState<{
    x: number; y: number; type: 'page' | 'category'; id: string
  } | null>(null)

  // Inline rename state
  const [editingHref, setEditingHref] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatValue, setEditingCatValue] = useState('')

  // Sidebar drag-to-reorder state
  const [sbDragHref, setSbDragHref] = useState<string | null>(null)
  const [sbDragFromCat, setSbDragFromCat] = useState<string | null>(null)
  const [sbDropCat, setSbDropCat] = useState<string | null>(null)
  const [sbDropIdx, setSbDropIdx] = useState<number | null>(null)

  // External stores
  const headerVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarHeaderVisible)
  const logoVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarLogoVisible)
  const titleSize = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleSize)
  const searchVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarSearchVisible)
  const enabledModules = useSyncExternalStore(subscribeModules, getEnabledModules)
  const sidebarConfig = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)

  // Unread badge counts
  const unreadCounts = useUnreadCounts()

  // Dashboard state for sub-items
  const dashboardState = useSyncExternalStore(subscribeDashboard, getDashboardState)

  // Theme state for per-page/per-category overrides
  const themeState = useThemeState()

  // Derived state
  const collapsed = width <= 64
  const textOpacity = Math.min(1, Math.max(0, (width - 80) / 80))

  // Resolve categories from config, filter by enabled modules, apply custom names
  // Also resolve custom modules (hrefs starting with /custom/)
  const resolvedCategories = useMemo(() => {
    return sidebarConfig.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      items: cat.items
        .map(href => {
          // Custom module
          if (href.startsWith('/custom/')) {
            const modId = href.slice('/custom/'.length)
            const customMod = (sidebarConfig.customModules || []).find(m => m.id === modId)
            if (!customMod) return null
            return {
              href,
              label: sidebarConfig.customNames[href] || customMod.name,
              icon: FileText,
            } as NavItem
          }
          // Built-in nav item
          const navItem = navItemsByHref.get(href)
          if (!navItem) return null
          if (navItem.moduleId && !enabledModules.includes(navItem.moduleId)) return null
          return {
            ...navItem,
            label: sidebarConfig.customNames[href] || navItem.label,
          }
        })
        .filter(Boolean) as NavItem[],
    }))
  }, [sidebarConfig, enabledModules])

  // Memoize header layout computations
  const headerLayout = useMemo(() => {
    const titleAvailable = logoVisible ? Math.max(0, width - 16 - 45 - 14) : Math.max(0, width - 32)
    const titleH = titleSize + 16
    const logoH = 57
    const headerHeight = headerVisible ? Math.max(logoVisible ? logoH : 0, titleH) : 0
    const headerOpacity = headerVisible ? 1 : 0
    const titleWidth = logoVisible ? titleAvailable : Math.max(0, width - 32)
    return { headerHeight, headerOpacity, titleWidth }
  }, [logoVisible, width, titleSize, headerVisible])

  // Memoize search visibility
  const searchLayout = useMemo(() => {
    const show = searchVisible && width >= 100
    return { show }
  }, [searchVisible, width])

  // Derive collapsed categories from persisted config
  const collapsedCats = sidebarConfig.collapsedCategories || {}

  // Memoize category toggle map — stable callbacks per category id
  const toggleCallbacksRef = useRef<Map<string, () => void>>(new Map())

  const toggleCategory = useCallback((id: string) => {
    const current = getSidebarConfig().collapsedCategories || {}
    setCategoryCollapsed(id, !(current[id] ?? false))
  }, [])

  // Build stable toggle callbacks — only recreate when categories change
  const categoryToggleCallbacks = useMemo(() => {
    const map = toggleCallbacksRef.current
    const currentIds = new Set(resolvedCategories.map(c => c.id))
    // Clean up stale entries
    for (const key of map.keys()) {
      if (!currentIds.has(key)) map.delete(key)
    }
    // Add missing entries
    for (const id of currentIds) {
      if (!map.has(id)) {
        map.set(id, () => toggleCategory(id))
      }
    }
    return map
  }, [resolvedCategories, toggleCategory])

  // Memoize per-category delay offsets to avoid recalculating in render loop
  const categoryDelayOffsets = useMemo(() => {
    const offsets: number[] = []
    let running = 0
    for (const cat of resolvedCategories) {
      offsets.push(running)
      running += cat.items.length
    }
    return offsets
  }, [resolvedCategories])

  // Compute page override colors for indicator dots
  const pageOverrideColors = useMemo(() => {
    const map: Record<string, string> = {}
    const overrides = themeState.pageOverrides
    if (!overrides) return map
    for (const [href, themeId] of Object.entries(overrides)) {
      const t = BUILT_IN_THEMES.find(bt => bt.id === themeId) ?? themeState.customThemes.find(ct => ct.id === themeId)
      if (t) map[href] = t.colors['accent'] || '#a78bfa'
    }
    return map
  }, [themeState.pageOverrides, themeState.customThemes])

  // Compute category override colors for indicator dots
  const categoryOverrideColors = useMemo(() => {
    const map: Record<string, string> = {}
    const overrides = themeState.categoryOverrides
    if (!overrides) return map
    for (const [catId, themeId] of Object.entries(overrides)) {
      const t = BUILT_IN_THEMES.find(bt => bt.id === themeId) ?? themeState.customThemes.find(ct => ct.id === themeId)
      if (t) map[catId] = t.colors['accent'] || '#a78bfa'
    }
    return map
  }, [themeState.categoryOverrides, themeState.customThemes])

  /* ── Sidebar drag-to-reorder handlers ──────────────────────────────── */

  const handleSbDragStart = useCallback((href: string, catId: string) => {
    setSbDragHref(href)
    setSbDragFromCat(catId)
  }, [])

  const handleSbDragOver = useCallback((catId: string, idx: number) => {
    setSbDropCat(catId)
    setSbDropIdx(idx)
  }, [])

  const handleSbDrop = useCallback((catId: string, idx: number) => {
    if (!sbDragHref || !sbDragFromCat) return
    const config = getSidebarConfig()
    const newCategories = config.categories.map(c => ({ ...c, items: [...c.items] }))

    const sourceCat = newCategories.find(c => c.id === sbDragFromCat)
    if (sourceCat) {
      sourceCat.items = sourceCat.items.filter(h => h !== sbDragHref)
    }
    const targetCat = newCategories.find(c => c.id === catId)
    if (targetCat) {
      let adjustedIdx = idx
      if (sbDragFromCat === catId) {
        const oldIdx = config.categories.find(c => c.id === catId)!.items.indexOf(sbDragHref)
        if (oldIdx < idx) adjustedIdx = Math.max(0, idx - 1)
      }
      targetCat.items.splice(adjustedIdx, 0, sbDragHref)
    }

    setSidebarConfig({ ...config, categories: newCategories })
    setSbDragHref(null)
    setSbDragFromCat(null)
    setSbDropCat(null)
    setSbDropIdx(null)
  }, [sbDragHref, sbDragFromCat])

  const handleSbDragEnd = useCallback(() => {
    setSbDragHref(null)
    setSbDragFromCat(null)
    setSbDropCat(null)
    setSbDropIdx(null)
  }, [])

  /* ── Context menu handlers ───────────────────────────────────────────── */

  const handleItemContextMenu = useCallback((href: string, catId: string, e: React.MouseEvent) => {
    e.preventDefault()
    const config = getSidebarConfig()
    const cat = config.categories.find(c => c.id === catId)
    if (!cat) return
    const idx = cat.items.indexOf(href)
    const isFirst = idx === 0
    const isLast = idx === cat.items.length - 1
    const isCustom = href.startsWith('/custom/')
    const navItem = navItemsByHref.get(href)
    const displayName = config.customNames[href] || (isCustom
      ? (config.customModules || []).find(m => `/custom/${m.id}` === href)?.name || 'Module'
      : navItem?.label || 'Item')

    const items: ContextMenuItem[] = [
      {
        label: 'Rename',
        icon: PencilSimple,
        onClick: () => {
          setEditingHref(href)
          setEditingValue(displayName)
        },
      },
      {
        label: 'Move Up',
        icon: ArrowUp,
        onClick: () => moveItem(href, 'up'),
        disabled: isFirst,
      },
      {
        label: 'Move Down',
        icon: ArrowDown,
        onClick: () => moveItem(href, 'down'),
        disabled: isLast,
      },
    ]

    // Theme override options
    const hasPageOverride = !!(themeState.pageOverrides?.[href])
    items.push({
      label: hasPageOverride ? 'Change Page Theme' : 'Set Page Theme',
      icon: Palette,
      onClick: () => {
        setThemeOverrideMenu({ x: e.clientX, y: e.clientY, type: 'page', id: href })
      },
    })
    if (hasPageOverride) {
      items.push({
        label: 'Clear Page Theme',
        icon: X,
        onClick: () => clearPageOverride(href),
      })
    }

    items.push({
      label: 'Delete',
      icon: Trash,
      onClick: () => {
        softDeleteItem(href)
        if (pathname === href) navigate('/')
      },
      danger: true,
    })

    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }, [pathname, navigate, themeState.pageOverrides])

  const handleCategoryContextMenu = useCallback((catId: string, e: React.MouseEvent) => {
    e.preventDefault()
    const config = getSidebarConfig()
    const cat = config.categories.find(c => c.id === catId)
    if (!cat) return

    const items: ContextMenuItem[] = [
      {
        label: 'Rename Category',
        icon: PencilSimple,
        onClick: () => {
          setEditingCatId(catId)
          setEditingCatValue(cat.name)
        },
      },
      {
        label: 'Create Module',
        icon: FolderPlus,
        onClick: () => {
          const href = createCustomModule('New Module', catId)
          navigate(href)
          setTimeout(() => {
            setEditingHref(href)
            setEditingValue('New Module')
          }, 50)
        },
      },
      {
        label: 'Move to Unused',
        icon: EyeSlash,
        onClick: () => {
          const cfg = getSidebarConfig()
          const c = cfg.categories.find(cc => cc.id === catId)
          if (!c) return
          setSidebarConfig({
            ...cfg,
            categories: cfg.categories.filter(cc => cc.id !== catId),
            unusedCategories: [...(cfg.unusedCategories || []), c],
          })
        },
      },
    ]

    // Theme override options for category
    const hasCatOverride = !!(themeState.categoryOverrides?.[catId])
    items.push({
      label: hasCatOverride ? 'Change Category Theme' : 'Set Category Theme',
      icon: Palette,
      onClick: () => {
        setThemeOverrideMenu({ x: e.clientX, y: e.clientY, type: 'category', id: catId })
      },
    })
    if (hasCatOverride) {
      items.push({
        label: 'Clear Category Theme',
        icon: X,
        onClick: () => clearCategoryOverride(catId),
      })
    }

    items.push({
      label: 'Delete Category',
      icon: Trash,
      onClick: () => {
        const cfg = getSidebarConfig()
        const c = cfg.categories.find(cc => cc.id === catId)
        if (!c) return
        if (c.items.length > 0) {
          // Move items to first remaining category
          const remaining = cfg.categories.filter(cc => cc.id !== catId)
          if (remaining.length > 0) {
            remaining[0].items = [...remaining[0].items, ...c.items]
          }
          setSidebarConfig({ ...cfg, categories: remaining })
        } else {
          setSidebarConfig({ ...cfg, categories: cfg.categories.filter(cc => cc.id !== catId) })
        }
      },
      danger: true,
      disabled: config.categories.length <= 1,
    })

    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }, [navigate, themeState.categoryOverrides])

  /* ── Inline editing handlers ─────────────────────────────────────────── */

  const handleEditComplete = useCallback((val?: string) => {
    const name = val ?? editingValue
    if (editingHref && name.trim()) {
      renameItem(editingHref, name.trim())
    }
    setEditingHref(null)
  }, [editingHref, editingValue])

  const handleEditCancel = useCallback(() => {
    setEditingHref(null)
  }, [])

  const handleCatEditComplete = useCallback((val?: string) => {
    const name = val ?? editingCatValue
    if (editingCatId && name.trim()) {
      renameCategory(editingCatId, name.trim())
    }
    setEditingCatId(null)
  }, [editingCatId, editingCatValue])

  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  /* ── Resize handle ─────────────────────────────────────────────────────── */

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = width

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newWidth = Math.max(64, Math.min(320, startWidth + delta))
      onWidthChange(newWidth)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', function handleUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      const delta = ev.clientX - startX
      const finalWidth = Math.max(64, Math.min(320, startWidth + delta))
      const snapWidth = finalWidth < 100 ? (finalWidth < 82 ? 64 : 100) : finalWidth
      const needsSnap = snapWidth !== finalWidth

      if (needsSnap) {
        draggingRef.current = false
        setIsDragging(false)
        requestAnimationFrame(() => onWidthChange(snapWidth))
      } else {
        onWidthChange(snapWidth)
        draggingRef.current = false
        setTimeout(() => setIsDragging(false), 100)
      }
      // Save as default width (unless collapsed)
      if (snapWidth > 64) setSidebarDefaultWidth(snapWidth)
    })
  }, [width, onWidthChange, draggingRef])

  /* ── Prefetch on hover ─────────────────────────────────────────────────── */

  const handleHoverItem = useCallback((href: string) => {
    const config = PREFETCH_ROUTES[href]
    if (config) {
      queryClient.prefetchQuery({
        queryKey: config.key,
        queryFn: () => api.get(config.path),
        staleTime: 30_000,
      })
    }
  }, [queryClient])

  /* ── Collapse toggle ───────────────────────────────────────────────────── */

  const defaultWidth = useSyncExternalStore(subscribeSidebarSettings, getSidebarDefaultWidth)

  const toggleCollapse = useCallback(() => {
    onWidthChange(collapsed ? defaultWidth : 64)
  }, [collapsed, defaultWidth, onWidthChange])

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <nav aria-label="Main navigation" data-testid="sidebar" data-tour="sidebar" style={{
      width: `${width}px`,
      minWidth: `${width}px`,
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      display: 'flex',
      flexDirection: 'column',
      transition: draggingRef.current ? 'none' : `width 0.2s var(--ease-spring), min-width 0.2s var(--ease-spring)`,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 100,
      pointerEvents: isDragging ? 'none' : 'auto',
    }}>

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {ctxMenu && <ContextMenu {...ctxMenu} onClose={closeCtxMenu} />}

      {/* Theme override submenu */}
      {themeOverrideMenu && (
        <ThemeOverrideMenu
          x={themeOverrideMenu.x}
          y={themeOverrideMenu.y}
          type={themeOverrideMenu.type}
          targetId={themeOverrideMenu.id}
          currentOverrideId={
            themeOverrideMenu.type === 'page'
              ? themeState.pageOverrides?.[themeOverrideMenu.id]
              : themeState.categoryOverrides?.[themeOverrideMenu.id]
          }
          onClose={() => setThemeOverrideMenu(null)}
        />
      )}

      {/* ── Logo header — slides up like search when hidden ────────────── */}
      <div style={{
        height: `${headerLayout.headerHeight}px`,
        opacity: headerLayout.headerOpacity,
        overflow: 'hidden',
        transition: 'height 0.25s ease, opacity 0.2s ease',
        flexShrink: 0,
      }}>
        <header style={{
          padding: '0 8px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: logoVisible ? 'flex-start' : 'center',
        }}>
          {logoVisible && (
            <div role="img" aria-label="OpenClaw Manager" style={logoStyle} />
          )}
          <div style={{
            overflow: 'hidden',
            minWidth: 0,
            flex: logoVisible ? 1 : undefined,
            width: logoVisible ? undefined : '100%',
            display: 'flex',
            justifyContent: logoVisible ? 'flex-start' : 'center',
          }}>
            <TypewriterTitle availableWidth={headerLayout.titleWidth} />
          </div>
        </header>
      </div>

      {/* ── Search — full size when on, animates away below 140px ── */}
      <div style={{
        height: searchLayout.show ? '46px' : '0px',
        opacity: searchLayout.show ? 1 : 0,
        overflow: 'hidden',
        transition: 'height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
        flexShrink: 0,
        paddingTop: searchLayout.show && !headerVisible ? '8px' : 0,
        pointerEvents: searchLayout.show ? 'auto' : 'none',
      }}>
        <GlobalSearch compact collapsed={collapsed} sidebarWidth={width} />
      </div>

      {/* ── Divider between header/search and nav items ────────────────── */}
      <div style={fixedDividerStyle} />

      {/* ── Scrollable nav items ─────────────────────────────────────────── */}
      <div
        onContextMenu={(e) => {
          // Only fire if right-clicking empty space (not items/categories)
          if (e.target === e.currentTarget) {
            e.preventDefault()
            setCtxMenu({
              x: e.clientX, y: e.clientY,
              items: [
                {
                  label: 'Create Category',
                  icon: FolderPlus,
                  onClick: () => {
                    const config = getSidebarConfig()
                    const id = `custom-${Date.now()}`
                    setSidebarConfig({ ...config, categories: [...config.categories, { id, name: 'New Category', items: [] }] })
                    setEditingCatId(id)
                    setEditingCatValue('New Category')
                  },
                },
                {
                  label: 'Create Module',
                  icon: FileText,
                  onClick: () => {
                    const href = createCustomModule('New Module')
                    navigate(href)
                    setTimeout(() => { setEditingHref(href); setEditingValue('New Module') }, 50)
                  },
                },
                {
                  label: 'Edit Sidebar',
                  icon: Gear,
                  onClick: () => navigate('/settings?section=modules'),
                },
              ],
            })
          }
        }}
        data-tour="module-list"
        style={{
          flex: 1,
          minHeight: 0,
          padding: collapsed ? '4px 8px' : '12px 8px',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: draggingRef.current ? 'none' : 'padding 0.25s var(--ease-spring)',
        }}
      >
        {resolvedCategories.map((cat, idx) => {
          const isEditingThisCat = editingCatId === cat.id
          return (
            <React.Fragment key={cat.id}>
              {idx > 0 && cat.name && <SectionDivider />}
              {isEditingThisCat ? (
                /* Inline category rename */
                <div style={{ marginBottom: collapsed ? '2px' : '4px', padding: '8px 12px' }}>
                  <input
                    autoFocus
                    aria-label="Rename sidebar category"
                    defaultValue={editingCatValue}
                    onBlur={e => handleCatEditComplete(e.currentTarget.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCatEditComplete(e.currentTarget.value)
                      if (e.key === 'Escape') setEditingCatId(null)
                    }}
                    style={catRenameInputStyle}
                  />
                </div>
              ) : (
                <>
                  <NavSection
                    label={cat.name}
                    items={cat.items}
                    pathname={pathname}
                    collapsed={collapsed}
                    textOpacity={textOpacity}
                    width={width}
                    open={!(collapsedCats[cat.id] ?? false)}
                    onToggle={categoryToggleCallbacks.get(cat.id)!}
                    onHoverItem={handleHoverItem}
                    isDragging={isDragging}
                    delayOffset={categoryDelayOffsets[idx]}
                    categoryId={cat.id}
                    onItemContextMenu={handleItemContextMenu}
                    onCategoryContextMenu={handleCategoryContextMenu}
                    editingHref={editingHref}
                    editingValue={editingValue}
                    onEditingChange={setEditingValue}
                    onEditingComplete={handleEditComplete}
                    onEditingCancel={handleEditCancel}
                    onDragStart={handleSbDragStart}
                    onDragOver={handleSbDragOver}
                    onDrop={handleSbDrop}
                    onDragEnd={handleSbDragEnd}
                    dragOverIdx={sbDropCat === cat.id ? sbDropIdx : null}
                    dragHref={sbDragHref}
                    overrideColors={pageOverrideColors}
                    categoryOverrideColor={categoryOverrideColors[cat.id]}
                    unreadCounts={unreadCounts}
                  />
                  {/* Dashboard page sub-items -- only when category contains /dashboard, multiple pages, expanded sidebar, and category is open */}
                  {cat.items.some(i => i.href === '/dashboard') &&
                    dashboardState.pages.length > 1 &&
                    width > 120 &&
                    !collapsed &&
                    !(collapsedCats[cat.id] ?? false) && (
                    <div style={{ paddingLeft: 28, marginBottom: 4 }}>
                      {dashboardState.pages.map(page => (
                        <button
                          key={page.id}
                          onClick={() => {
                            setActivePage(page.id)
                            if (pathname !== '/dashboard') navigate('/dashboard')
                          }}
                          aria-label={`Dashboard page: ${page.name}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 12px',
                            fontSize: '11px',
                            color: page.id === dashboardState.activePageId ? 'var(--accent)' : 'var(--text-muted)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            width: '100%',
                            borderRadius: 6,
                            textAlign: 'left',
                            fontFamily: 'inherit',
                            fontWeight: page.id === dashboardState.activePageId ? 600 : 400,
                          }}
                          className="hover-bg"
                        >
                          <span style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: page.id === dashboardState.activePageId ? 'var(--accent)' : 'var(--text-muted)',
                            flexShrink: 0,
                            opacity: 0.6,
                          }} />
                          {page.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* ── Divider before bottom section ──────────────────────────────── */}
      <div style={fixedDividerStyle} />

      {/* ── Bottom section (non-scrollable) ──────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: '8px 8px 0',
      }}>
        {/* Icon bar — row when expanded, column when collapsed, smooth transition */}
        <div style={{
          display: 'flex',
          flexDirection: collapsed ? 'column-reverse' : 'row',
          gap: collapsed ? '0px' : '4px',
          marginBottom: '4px',
        }}>
          {!captureOpen && (
            <Link
              to="/settings"
              title="Gear"
              className="hover-bg"
              data-tour="settings"
              onMouseEnter={() => handleHoverItem('/settings')}
              style={{
                flex: collapsed ? undefined : 1,
                display: 'flex',
                alignItems: 'center',
                padding: '10px 0',
                borderRadius: '10px',
                color: 'var(--text-secondary)',
                background: 'transparent',
                textDecoration: 'none',
                justifyContent: 'center',
              }}
            >
              <Gear size={16} style={settingsIconStyle} />
            </Link>
          )}
          {!captureOpen && <NotificationBell collapsed={true} textOpacity={0} />}
          <SidebarQuickCapture collapsed={true} textOpacity={0} onOpenChange={setCaptureOpen} />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            width: '100%',
            margin: '4px 0 12px',
            padding: '8px',
            background: 'var(--bg-white-04)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring)`,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--hover-bg-bright)'
            e.currentTarget.style.borderColor = 'var(--border-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-white-04)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          <span style={{
            display: 'flex',
            transition: `transform 0.3s var(--ease-spring)`,
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          }}>
            <CaretRight size={14} />
          </span>
        </button>
      </div>

      {/* ── Status bar (Discord-style, always visible at bottom) ────────── */}
      <StatusBar collapsed={collapsed} />

      {/* ── Resize handle (right edge) — invisible until hover ─────────── */}
      <div
        onMouseDown={handleResizeStart}
        className="sidebar-resize-handle"
        style={resizeHandleStyle}
      />
    </nav>
  )
}
