import React, { useState, useCallback, useRef, useMemo, useSyncExternalStore, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, Settings, Plus, StickyNote, CheckSquare, Lightbulb, Flag, FileText, ArrowUp, ArrowDown, Pencil, Trash2, FolderPlus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import GlobalSearch from './GlobalSearch'
import { NotificationBell } from './NotificationCenter'
import { ContextMenu, type ContextMenuState, type ContextMenuItem } from './ContextMenu'
import { type NavItem, navItemsByHref } from '@/lib/nav-items'
import { subscribeSidebarSettings, getSidebarHeaderVisible, getSidebarDefaultWidth, getSidebarTitleLayout, getSidebarTitleText, getSidebarSearchVisible } from '@/lib/sidebar-settings'
import { subscribeModules, getEnabledModules } from '@/lib/modules'
import {
  getSidebarConfig, setSidebarConfig, subscribeSidebarConfig,
  moveItem, renameItem, renameCategory, createCustomModule, deleteCustomModule,
} from '@/lib/sidebar-config'
import { queryKeys } from '@/lib/query-keys'
import { api } from '@/lib/api'

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SidebarProps {
  width: number
  onWidthChange: (w: number) => void
  draggingRef: React.MutableRefObject<boolean>
}

type CaptureType = 'note' | 'task' | 'idea' | 'decision'

const CAPTURE_TYPES: { type: CaptureType; label: string; icon: React.ElementType }[] = [
  { type: 'note', label: 'Note', icon: StickyNote },
  { type: 'task', label: 'Task', icon: CheckSquare },
  { type: 'idea', label: 'Idea', icon: Lightbulb },
  { type: 'decision', label: 'Decision', icon: Flag },
]

const PREFETCH_ROUTES: Record<string, { key: readonly string[]; path: string }> = {
  '/': { key: queryKeys.todos, path: '/api/todos' },
  '/missions': { key: queryKeys.missions, path: '/api/missions' },
  '/settings': { key: queryKeys.prefs, path: '/api/prefs' },
}

/* ─── NavSection (memoized) ──────────────────────────────────────────────── */

const NavSection = React.memo(function NavSection({
  label,
  items,
  pathname,
  collapsed,
  textOpacity,
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
  onEditingChange,
  onEditingComplete,
  onEditingCancel,
  onDragStart: onItemDragStart,
  onDragOver: onItemDragOver,
  onDrop: onItemDrop,
  onDragEnd: onItemDragEnd,
  dragOverIdx,
  dragHref,
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
  onEditingComplete?: () => void
  onEditingCancel?: () => void
  // Drag-to-reorder
  onDragStart?: (href: string, catId: string) => void
  onDragOver?: (catId: string, idx: number) => void
  onDrop?: (catId: string, idx: number) => void
  onDragEnd?: () => void
  dragOverIdx?: number | null
  dragHref?: string | null
}) {
  // Typewriter effect — calculate chars that physically fit in available space
  const labelCharWidth = 7 // ~10px uppercase font + letter-spacing
  const labelAvailable = Math.max(0, width - 40) // sidebar minus container + button padding
  const labelCharsVisible = Math.min(label.length, Math.floor(labelAvailable / labelCharWidth))
  const labelText = label.slice(0, labelCharsVisible)
  const labelIsTyping = labelCharsVisible > 0 && labelCharsVisible < label.length
  const chevronOpacity = Math.min(1, Math.max(0, (width - 180) / 40))
  // Slide up only during snap (80→64), not while manually resizing
  const labelOpacity = width >= 80 ? 1 : width <= 64 ? 0 : (width - 64) / 16
  const labelHeight = width >= 80 ? 36 : width <= 64 ? 0 : ((width - 64) / 16) * 36

  return (
    <div style={{ marginBottom: collapsed ? '2px' : '4px' }}>
      {/* Section label — slides up like search bar below 130px */}
      <div style={{
        height: `${labelHeight}px`,
        opacity: labelOpacity,
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
      }}>
        <button
          onClick={onToggle}
          onContextMenu={categoryId && onCategoryContextMenu ? (e) => { e.preventDefault(); onCategoryContextMenu(categoryId, e) } : undefined}
          style={{
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
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <span>
            {labelText}
            {labelIsTyping && <span className="type-cursor">|</span>}
          </span>
          {chevronOpacity > 0 && (
            <span style={{
              transition: isDragging ? 'none' : 'transform 0.3s var(--ease-spring), opacity 0.2s ease',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              display: 'flex',
              opacity: chevronOpacity,
            }}>
              <ChevronDown size={12} />
            </span>
          )}
        </button>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateRows: (open || collapsed) ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--duration-normal) var(--ease-spring)',
        overflow: 'hidden',
      }}>
        <div style={{ overflow: 'hidden' }}>
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '5px 16px',
                    borderRadius: '10px',
                    marginBottom: '2px',
                    background: 'var(--active-bg)',
                  }}
                >
                  <Icon size={16} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                  <input
                    autoFocus
                    defaultValue={editingValue || ''}
                    onBlur={e => { onEditingChange?.(e.currentTarget.value); setTimeout(() => onEditingComplete?.(), 0) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onEditingChange?.(e.currentTarget.value); onEditingComplete?.() }
                      if (e.key === 'Escape') onEditingCancel?.()
                    }}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--accent)',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 600,
                      outline: 'none',
                      padding: '4px 0',
                      minWidth: 0,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              )
            }

            return (
              <div key={href}>
                {showDropBefore && (
                  <div style={{ height: '2px', background: 'var(--accent)', borderRadius: '1px', margin: '0 12px', boxShadow: '0 0 6px var(--accent)' }} />
                )}
                <Link
                  to={href}
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
                  title={navCharsVisible < itemLabel.length ? itemLabel : undefined}
                  onMouseEnter={() => onHoverItem(href)}
                  onContextMenu={categoryId && onItemContextMenu ? (e) => { e.preventDefault(); onItemContextMenu(href, categoryId, e) } : undefined}
                  className="hover-bg"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '9px 16px',
                    borderRadius: '10px',
                    marginBottom: '2px',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    background: active ? 'var(--active-bg)' : 'transparent',
                    border: 'none',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: active ? 600 : 450,
                    transition: isDragging ? 'none' : `background 0.25s var(--ease-spring), color 0.25s var(--ease-spring), transform 0.25s var(--ease-spring)`,
                    justifyContent: 'flex-start',
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
                  {navCharsVisible > 0 && (
                    <span>
                      {navText}
                      {navIsTyping && <span className="type-cursor">|</span>}
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
          color: open ? '#fff' : 'var(--text-secondary)',
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
          e.currentTarget.style.color = open ? '#fff' : 'var(--text-secondary)'
        }}
      >
        <Plus size={16} style={{ flexShrink: 0 }} />
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
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
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
                  background: captureType === type ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
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
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
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
                background: text.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                border: 'none',
                borderRadius: '8px',
                color: text.trim() ? '#fff' : 'var(--text-muted)',
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

function TypewriterTitle({ availableWidth }: { availableWidth: number }) {
  const layout = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleLayout)
  const titleText = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleText)
  const twoLine = layout === 'two-line'
  const charWidth = 15

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
        fontSize: '22px',
        fontWeight: 700,
        fontFamily: "'Bitcount Prop Double', monospace",
        color: 'var(--text-primary)',
        letterSpacing: '0.08em',
        lineHeight: 0.9,
        whiteSpace: 'pre',
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
      fontSize: '22px',
      fontWeight: 700,
      fontFamily: "'Bitcount Prop Double', monospace",
      color: 'var(--text-primary)',
      letterSpacing: '0.08em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}>
      {visibleText}
      {showCursor && <span className="type-cursor">|</span>}
    </div>
  )
}

/* ─── Gradient divider ───────────────────────────────────────────────────── */

function SectionDivider() {
  return (
    <div style={{
      height: '1px',
      margin: '4px 12px',
      background: 'linear-gradient(to right, transparent, var(--border-hover), transparent)',
    }} />
  )
}

/* ─── Main Sidebar ───────────────────────────────────────────────────────── */

export default function Sidebar({ width, onWidthChange, draggingRef }: SidebarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({})
  const [isDragging, setIsDragging] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)

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
  const searchVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarSearchVisible)
  const enabledModules = useSyncExternalStore(subscribeModules, getEnabledModules)
  const sidebarConfig = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)

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

  const toggleCategory = useCallback((id: string) => {
    setOpenCategories(prev => ({ ...prev, [id]: !(prev[id] ?? true) }))
  }, [])

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
        icon: Pencil,
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

    if (isCustom) {
      items.push({
        label: 'Delete Module',
        icon: Trash2,
        onClick: () => {
          const modId = href.slice('/custom/'.length)
          deleteCustomModule(modId)
          if (pathname === href) navigate('/')
        },
        danger: true,
      })
    }

    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }, [pathname, navigate])

  const handleCategoryContextMenu = useCallback((catId: string, e: React.MouseEvent) => {
    e.preventDefault()
    const config = getSidebarConfig()
    const cat = config.categories.find(c => c.id === catId)
    if (!cat) return

    const items: ContextMenuItem[] = [
      {
        label: 'Rename Category',
        icon: Pencil,
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
          // Auto-start editing the new module's name
          setTimeout(() => {
            setEditingHref(href)
            setEditingValue('New Module')
          }, 50)
        },
      },
    ]

    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }, [navigate])

  /* ── Inline editing handlers ─────────────────────────────────────────── */

  const handleEditComplete = useCallback(() => {
    if (editingHref && editingValue.trim()) {
      renameItem(editingHref, editingValue.trim())
    }
    setEditingHref(null)
  }, [editingHref, editingValue])

  const handleEditCancel = useCallback(() => {
    setEditingHref(null)
  }, [])

  const handleCatEditComplete = useCallback(() => {
    if (editingCatId && editingCatValue.trim()) {
      renameCategory(editingCatId, editingCatValue.trim())
    }
    setEditingCatId(null)
  }, [editingCatId, editingCatValue])

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
        // Re-enable transitions first, then set snap target so it animates
        draggingRef.current = false
        setIsDragging(false)
        // Small rAF delay so the browser picks up the transition re-enable
        requestAnimationFrame(() => onWidthChange(snapWidth))
      } else {
        onWidthChange(snapWidth)
        draggingRef.current = false
        setTimeout(() => setIsDragging(false), 100)
      }
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

  const settingsActive = pathname === '/settings'

  return (
    <nav aria-label="Main navigation" style={{
      width: `${width}px`,
      minWidth: `${width}px`,
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      display: 'flex',
      flexDirection: 'column',
      transition: draggingRef.current ? 'none' : `width var(--duration-normal) var(--ease-spring), min-width var(--duration-normal) var(--ease-spring)`,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 100,
      pointerEvents: isDragging ? 'none' : 'auto',
    }}>

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {ctxMenu && <ContextMenu {...ctxMenu} onClose={() => setCtxMenu(null)} />}

      {/* ── Logo header — slides up like search when hidden ────────────── */}
      {(() => {
        const titleAvailable = Math.max(0, width - 16 - 45 - 14)
        const headerHeight = headerVisible ? 57 : 0
        const headerOpacity = headerVisible ? 1 : 0
        return (
          <div style={{
            height: `${headerHeight}px`,
            opacity: headerOpacity,
            overflow: 'hidden',
            transition: 'height 0.25s ease, opacity 0.2s ease',
            flexShrink: 0,
          }}>
            <header style={{
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              justifyContent: 'flex-start',
            }}>
              <div
                role="img"
                aria-label="Mission Control"
                style={{
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
                } as React.CSSProperties}
              />
              <div style={{
                overflow: 'hidden',
                minWidth: 0,
                flex: 1,
              }}>
                <TypewriterTitle availableWidth={titleAvailable} />
              </div>
            </header>
          </div>
        )
      })()}

      {/* ── Search — full size when on, animates away below 140px ── */}
      {(() => {
        const show = searchVisible && width >= 100
        return (
          <div style={{
            height: show ? '46px' : '0px',
            opacity: show ? 1 : 0,
            overflow: 'hidden',
            transition: 'height 0.25s ease, opacity 0.2s ease',
            flexShrink: 0,
            pointerEvents: show ? 'auto' : 'none',
          }}>
            <GlobalSearch compact collapsed={collapsed} sidebarWidth={width} />
          </div>
        )
      })()}

      {/* ── Divider between header/search and nav items ────────────────── */}
      <div style={{
        height: '1px',
        margin: '4px 12px',
        background: 'linear-gradient(to right, transparent, var(--border-hover), transparent)',
        flexShrink: 0,
      }} />

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
                  icon: Settings,
                  onClick: () => navigate('/settings?section=modules'),
                },
              ],
            })
          }
        }}
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
          const prevItemCount = resolvedCategories.slice(0, idx).reduce((sum, c) => sum + c.items.length, 0)
          const isEditingThisCat = editingCatId === cat.id
          return (
            <React.Fragment key={cat.id}>
              {idx > 0 && <SectionDivider />}
              {isEditingThisCat ? (
                /* Inline category rename */
                <div style={{ marginBottom: collapsed ? '2px' : '4px', padding: '8px 12px' }}>
                  <input
                    autoFocus
                    defaultValue={editingCatValue}
                    onBlur={e => { setEditingCatValue(e.currentTarget.value); setTimeout(handleCatEditComplete, 0) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setEditingCatValue(e.currentTarget.value); handleCatEditComplete() }
                      if (e.key === 'Escape') setEditingCatId(null)
                    }}
                    style={{
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
                    }}
                  />
                </div>
              ) : (
                <NavSection
                  label={cat.name}
                  items={cat.items}
                  pathname={pathname}
                  collapsed={collapsed}
                  textOpacity={textOpacity}
                  width={width}
                  open={openCategories[cat.id] ?? true}
                  onToggle={() => toggleCategory(cat.id)}
                  onHoverItem={handleHoverItem}
                  isDragging={isDragging}
                  delayOffset={prevItemCount}
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
                />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* ── Divider before bottom section ──────────────────────────────── */}
      <div style={{
        height: '1px',
        margin: '4px 12px',
        background: 'linear-gradient(to right, transparent, var(--border-hover), transparent)',
        flexShrink: 0,
      }} />

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
              title="Settings"
              className="hover-bg"
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
              <Settings size={16} style={{ flexShrink: 0 }} />
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
            background: 'rgba(255, 255, 255, 0.04)',
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
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
            e.currentTarget.style.borderColor = 'var(--border-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          <span style={{
            display: 'flex',
            transition: `transform 0.3s var(--ease-spring)`,
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          }}>
            <ChevronRight size={14} />
          </span>
        </button>
      </div>

      {/* ── Resize handle (right edge) ───────────────────────────────────── */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '5px',
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
      />
    </nav>
  )
}
