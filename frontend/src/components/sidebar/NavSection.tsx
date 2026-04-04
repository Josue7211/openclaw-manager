import React from 'react'
import { Link } from 'react-router-dom'
import { CaretDown } from '@phosphor-icons/react'
import { markRead } from '@/lib/unread-store'
import { type NavItem } from '@/lib/nav-items'
import {
  editingInputStyle,
  editingRowStyle,
  overflowHiddenStyle,
  sectionLabelBtnStyle,
} from './styles'

interface NavSectionProps {
  label: string
  items: NavItem[]
  pathname: string
  collapsed: boolean
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
  onEditingComplete?: (val?: string) => void
  onEditingCancel?: () => void
  onDragStart?: (href: string, catId: string) => void
  onDragOver?: (catId: string, idx: number) => void
  onDrop?: (catId: string, idx: number) => void
  onDragEnd?: () => void
  dragOverIdx?: number | null
  dragHref?: string | null
  overrideColors?: Record<string, string>
  categoryOverrideColor?: string
  unreadCounts?: Record<string, number>
}

const NavSection = React.memo(function NavSection({
  label,
  items,
  pathname,
  collapsed,
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
}: NavSectionProps) {
  const labelCharWidth = 7
  const labelAvailable = Math.max(0, width - 40)
  const labelCharsVisible = Math.min(label.length, Math.floor(labelAvailable / labelCharWidth))
  const labelText = label.slice(0, labelCharsVisible)
  const labelIsTyping = labelCharsVisible > 0 && labelCharsVisible < label.length
  const chevronOpacity = Math.min(1, Math.max(0, (width - 180) / 40))
  const hasUnreadChild = !open && items.some(item => (unreadCounts?.[item.href] || 0) > 0)
  const labelOpacity = width >= 80 ? 1 : width <= 64 ? 0 : (width - 64) / 16
  const labelHeight = width >= 80 ? 36 : width <= 64 ? 0 : ((width - 64) / 16) * 36

  return (
    <div style={{ marginBottom: collapsed ? '2px' : '4px' }}>
      {label ? (
        <div
          style={{
            height: `${labelHeight}px`,
            opacity: labelOpacity,
            overflow: 'hidden',
            transition: isDragging ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
          }}
        >
          <button
            onClick={onToggle}
            onContextMenu={categoryId && onCategoryContextMenu ? (e) => {
              e.preventDefault()
              onCategoryContextMenu(categoryId, e)
            } : undefined}
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
              <span
                style={{
                  transition: isDragging ? 'none' : 'transform 0.3s var(--ease-spring), opacity 0.2s ease',
                  transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                  display: 'flex',
                  opacity: chevronOpacity,
                }}
              >
                <CaretDown size={12} />
              </span>
            )}
          </button>
        </div>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: (open || collapsed) ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--duration-normal) var(--ease-spring)',
          overflow: 'hidden',
        }}
      >
        <div style={overflowHiddenStyle}>
          {items.map(({ href, label: itemLabel, icon: Icon }, idx) => {
            const active = pathname === href
            const isEditing = editingHref === href
            const isBeingDragged = dragHref === href
            const showDropBefore = dragOverIdx === idx && dragHref !== href
            const showDropAfter = dragOverIdx === items.length && idx === items.length - 1 && dragHref !== href
            const navCharWidth = 8
            const navTextAvailable = Math.max(0, width - 58)
            const navCharsVisible = Math.min(itemLabel.length, Math.floor(navTextAvailable / navCharWidth))
            const navText = itemLabel.slice(0, navCharsVisible)
            const navIsTyping = navCharsVisible > 0 && navCharsVisible < itemLabel.length

            if (isEditing) {
              return (
                <div key={href} style={editingRowStyle}>
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
                  <div
                    style={{
                      height: '2px',
                      background: 'var(--accent)',
                      borderRadius: '1px',
                      margin: '0 12px',
                      boxShadow: '0 0 6px var(--accent)',
                    }}
                  />
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
                  onClick={() => {
                    markRead(href)
                    onHoverItem(href)
                  }}
                  onMouseEnter={() => onHoverItem(href)}
                  onContextMenu={categoryId && onItemContextMenu ? (e) => {
                    e.preventDefault()
                    onItemContextMenu(href, categoryId, e)
                  } : undefined}
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
                    transition: isDragging ? 'none' : 'background 0.25s var(--ease-spring), color 0.25s var(--ease-spring), transform 0.25s var(--ease-spring)',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    position: 'relative',
                    animation: `fadeInUp 0.4s var(--ease-spring) ${(delayOffset + idx) * 30}ms both`,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    opacity: isBeingDragged ? 0.3 : 1,
                    pointerEvents: isDragging ? 'none' : 'auto',
                  }}
                >
                  <Icon
                    size={16}
                    style={{
                      flexShrink: 0,
                      transition: 'color var(--duration-fast)',
                    }}
                  />
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
                  {(unreadCounts?.[href] || 0) > 0 && collapsed && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--red-500)',
                      }}
                    />
                  )}
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
                  <div
                    style={{
                      height: '2px',
                      background: 'var(--accent)',
                      borderRadius: '1px',
                      margin: '0 12px',
                      boxShadow: '0 0 6px var(--accent)',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

export default NavSection
