/*
 * Copied/adapted from T3 Code's sidebar project menu controls.
 * ClawControl wires these into its chat sidebar so project view/action menus
 * live with the copied project UI surface instead of inside Chat.tsx.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  ClipboardText,
  DotsThreeVertical,
  GitBranch,
  PencilSimple,
  SlidersHorizontal,
  Trash,
} from '@phosphor-icons/react'
import type {
  ChatProjectGroupingMode,
  ChatProjectSortOrder,
} from '@/chat/t3-adapters/projectWorkspace'

const opaquePanelStyle = {
  backgroundColor: '#18181f',
  opacity: 1,
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  backgroundClip: 'padding-box',
  isolation: 'isolate',
} as const
const PROJECT_MENU_Z_INDEX = 10000

const menuFocusableSelector = [
  'button:not([disabled])',
  'select:not([disabled])',
  '[role="menuitem"]:not([disabled])',
].join(',')

function projectMenuItemBackground({ active, danger }: { active?: boolean; danger?: boolean }): string {
  if (danger) return 'color-mix(in srgb, var(--red-500, #ef4444) 13%, var(--bg-card-solid, #18181f))'
  if (active) return 'color-mix(in srgb, var(--accent) 16%, var(--bg-card-solid, #18181f))'
  return 'transparent'
}

function menuFocusableItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return []
  return Array.from(menu.querySelectorAll<HTMLElement>(menuFocusableSelector))
}

function focusMenuItem(menu: HTMLElement | null, index: number) {
  const items = menuFocusableItems(menu)
  const item = items[index]
  if (item) item.focus()
}

function handleMenuNavigation(
  event: ReactKeyboardEvent<HTMLElement>,
  menu: HTMLElement | null,
  onClose: () => void,
) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
    return
  }

  if (
    event.target instanceof HTMLSelectElement
    && (event.key === 'ArrowDown' || event.key === 'ArrowUp')
  ) {
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = menuFocusableItems(menu)
  if (items.length === 0) return

  event.preventDefault()
  const currentIndex = items.findIndex((item) => item === document.activeElement)
  if (event.key === 'Home') {
    items[0]?.focus()
    return
  }
  if (event.key === 'End') {
    items[items.length - 1]?.focus()
    return
  }
  const direction = event.key === 'ArrowDown' ? 1 : -1
  const fallbackIndex = direction > 0 ? -1 : 0
  const nextIndex = (currentIndex === -1 ? fallbackIndex : currentIndex) + direction
  items[(nextIndex + items.length) % items.length]?.focus()
}

export function useDismissibleMenu(
  open: boolean,
  setOpen: (open: boolean) => void,
  floatingRef?: RefObject<HTMLElement | null>,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target)) return
      if (target instanceof Node && floatingRef?.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [floatingRef, open, setOpen])

  return containerRef
}

function ProjectSidebarHeaderButton({
  label,
  onClick,
  children,
  buttonRef,
  menuControls,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  buttonRef?: RefObject<HTMLButtonElement | null>
  menuControls?: string
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      aria-controls={menuControls}
      onClick={onClick}
      className="hover-bg"
      style={{
        width: 24,
        height: 22,
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--text-muted)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function ProjectViewSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label style={{ display: 'grid', gap: 4, color: 'var(--text-muted)', fontSize: 11 }}>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: '100%',
          height: 28,
          border: '1px solid var(--border)',
          borderRadius: 7,
          background: 'var(--bg-card-solid, #18181f)',
          color: 'var(--text-secondary)',
          font: 'inherit',
          fontSize: 12,
          padding: '0 6px',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

export function ProjectViewMenu({
  groupingValue,
  sortValue,
  onGroupingChange,
  onSortChange,
}: {
  groupingValue: ChatProjectGroupingMode
  sortValue: ChatProjectSortOrder
  onGroupingChange: (value: ChatProjectGroupingMode) => void
  onSortChange: (value: ChatProjectSortOrder) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const floatingMenuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 196 })
  const menuRef = useDismissibleMenu(open, setOpen, floatingMenuRef)
  const menuWidth = 196

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return
    const rect = trigger.getBoundingClientRect()
    const gutter = 8
    const availableWidth = Math.max(120, window.innerWidth - gutter * 2)
    const width = Math.min(menuWidth, availableWidth)
    const renderedHeight = floatingMenuRef.current?.offsetHeight || 128
    const maxLeft = Math.max(gutter, window.innerWidth - width - gutter)
    const left = Math.min(Math.max(gutter, rect.right - width), maxLeft)
    const hasRoomBelow = rect.bottom + 4 + renderedHeight <= window.innerHeight - gutter
    const unclampedTop = hasRoomBelow ? rect.bottom + 4 : rect.top - renderedHeight - 4
    const maxTop = Math.max(gutter, window.innerHeight - renderedHeight - gutter)
    const top = Math.min(Math.max(gutter, unclampedTop), maxTop)
    setMenuPosition({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (open) updateMenuPosition()
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => focusMenuItem(floatingMenuRef.current, 0))
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative', width: 24, height: 22 }}>
      <ProjectSidebarHeaderButton
        buttonRef={triggerRef}
        label="Project view options"
        menuControls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={14} />
      </ProjectSidebarHeaderButton>
      {open && createPortal(
        <div
          ref={floatingMenuRef}
          id={menuId}
          role="menu"
          aria-label="Project view options"
          data-t3-project-view-menu
          onKeyDown={(event) => handleMenuNavigation(event, floatingMenuRef.current, () => {
            setOpen(false)
            triggerRef.current?.focus()
          })}
          style={{
            position: 'fixed',
            zIndex: PROJECT_MENU_Z_INDEX,
            left: menuPosition.left,
            top: menuPosition.top,
            width: menuPosition.width,
            maxHeight: 'min(320px, calc(100vh - 16px))',
            overflowY: 'auto',
            display: 'grid',
            gap: 7,
            padding: 7,
            border: '1px solid var(--border-strong, var(--border))',
            borderRadius: 8,
            ...opaquePanelStyle,
            boxShadow: '0 18px 42px rgba(0, 0, 0, 0.56), 0 0 0 1px rgba(255, 255, 255, 0.04)',
          }}
        >
          <ProjectViewSelect
            label="Project grouping"
            value={groupingValue}
            onChange={(value) => onGroupingChange(value as ChatProjectGroupingMode)}
            options={[
              { value: 'repository', label: 'Group by repo' },
              { value: 'repository-path', label: 'Repo + path' },
              { value: 'separate', label: 'Separate roots' },
            ]}
          />
          <ProjectViewSelect
            label="Project sort"
            value={sortValue}
            onChange={(value) => onSortChange(value as ChatProjectSortOrder)}
            options={[
              { value: 'name', label: 'Name' },
              { value: 'machine', label: 'Machine' },
              { value: 'recent', label: 'Recent' },
            ]}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

export function ProjectMenuButton({
  label,
  icon,
  onClick,
  active = false,
  danger = false,
  disabled = false,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  active?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (disabled) return
        onClick()
      }}
      className="hover-bg"
      style={{
        minHeight: 32,
        border: danger ? '1px solid color-mix(in srgb, var(--red-500, #ef4444) 26%, transparent)' : '1px solid transparent',
        borderRadius: 6,
        background: projectMenuItemBackground({ active, danger }),
        color: danger ? 'var(--red-500)' : active ? 'var(--accent)' : 'var(--text-secondary)',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: 8,
        padding: '0 7px',
        font: 'inherit',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.52 : 1,
        textAlign: 'left',
      }}
    >
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  )
}

export function ProjectIconButton({
  label,
  onClick,
  children,
  buttonRef,
  disabled = false,
  active = false,
  danger = false,
  size = 22,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  buttonRef?: RefObject<HTMLButtonElement | null>
  disabled?: boolean
  active?: boolean
  danger?: boolean
  size?: number
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="hover-bg"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!disabled) onClick()
      }}
      style={{
        width: size,
        height: size,
        border: 'none',
        borderRadius: 6,
        backgroundColor: active ? 'color-mix(in srgb, var(--accent) 16%, #18181f)' : '#18181f',
        color: danger ? 'var(--red-500)' : active ? 'var(--accent)' : 'var(--text-muted)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  )
}

export function ProjectActionMenu({
  label,
  groupingLabel,
  groupingValue,
  copyLabel,
  copied,
  copyErrored,
  renameLabel,
  removeLabel,
  onCopy,
  onRename,
  onGroupingChange,
  onRemove,
  compact = false,
}: {
  label: string
  groupingLabel: string
  groupingValue: string
  copyLabel: string
  copied: boolean
  copyErrored: boolean
  renameLabel: string
  removeLabel: string
  onCopy: () => void
  onRename: () => void
  onGroupingChange: (value: string) => void
  onRemove: () => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const floatingMenuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 236 })
  const menuRef = useDismissibleMenu(open, setOpen, floatingMenuRef)
  const closeMenu = () => {
    setOpen(false)
  }
  const iconSize = compact ? 12 : 13
  const menuWidth = 236

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return
    const rect = trigger.getBoundingClientRect()
    const gutter = 8
    const width = Math.max(160, Math.min(menuWidth, window.innerWidth - gutter * 2))
    const renderedHeight = floatingMenuRef.current?.offsetHeight || 188
    const maxLeft = Math.max(gutter, window.innerWidth - width - gutter)
    const left = Math.min(Math.max(gutter, rect.right - width), maxLeft)
    const hasRoomBelow = rect.bottom + 4 + renderedHeight <= window.innerHeight - gutter
    const unclampedTop = hasRoomBelow
      ? rect.bottom + 4
      : rect.top - renderedHeight - 4
    const maxTop = Math.max(gutter, window.innerHeight - renderedHeight - gutter)
    const top = Math.min(Math.max(gutter, unclampedTop), maxTop)
    setMenuPosition({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (open) updateMenuPosition()
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => focusMenuItem(floatingMenuRef.current, 0))
  }, [open])

  return (
    <div
      ref={menuRef}
      style={{ position: 'relative', width: 22, height: 22 }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More actions for ${label}`}
        title={`More actions for ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className="hover-bg"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        style={{
          width: 22,
          height: 22,
          border: 'none',
          borderRadius: 6,
          backgroundColor: '#18181f',
          color: 'var(--text-muted)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <DotsThreeVertical size={iconSize} />
      </button>
      {open && createPortal(
        <div
          ref={floatingMenuRef}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${label}`}
          data-t3-project-action-menu
          onKeyDown={(event) => handleMenuNavigation(event, floatingMenuRef.current, () => {
            setOpen(false)
            triggerRef.current?.focus()
          })}
          style={{
            position: 'fixed',
            zIndex: PROJECT_MENU_Z_INDEX,
            left: menuPosition.left,
            top: menuPosition.top,
            width: menuPosition.width,
            maxHeight: 'min(360px, calc(100vh - 16px))',
            overflowY: 'auto',
            display: 'grid',
            gap: 5,
            padding: 7,
            border: '1px solid var(--border-strong, var(--border))',
            borderRadius: 8,
            ...opaquePanelStyle,
            boxShadow: '0 18px 42px rgba(0, 0, 0, 0.56), 0 0 0 1px rgba(255, 255, 255, 0.04)',
          }}
        >
          <ProjectMenuButton
            label={copyLabel}
            active={copied}
            danger={copyErrored}
            icon={<ClipboardText size={13} />}
            onClick={() => {
              onCopy()
              closeMenu()
            }}
          />
          <ProjectMenuButton
            label={renameLabel}
            icon={<PencilSimple size={13} />}
            onClick={() => {
              onRename()
              closeMenu()
            }}
          />
          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          <label style={{
            minHeight: 48,
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            alignItems: 'start',
            gap: 8,
            padding: '4px 7px 2px',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}>
            <GitBranch size={13} style={{ marginTop: 18 }} />
            <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Project grouping</span>
              <select
                aria-label={groupingLabel}
                title={groupingLabel}
                value={groupingValue}
                onChange={(event) => onGroupingChange(event.target.value)}
                style={{
                  minWidth: 0,
                  width: '100%',
                  height: 28,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--bg-card-solid, #18181f)',
                  color: 'var(--text-secondary)',
                  font: 'inherit',
                  fontSize: 12,
                  padding: '0 7px',
                }}
              >
                <option value="">Default grouping</option>
                <option value="repository">Group by repo</option>
                <option value="repository-path">Repo + path</option>
                <option value="separate">Separate root</option>
              </select>
            </span>
          </label>
          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          <ProjectMenuButton
            label={removeLabel}
            danger
            icon={<Trash size={13} />}
            onClick={() => {
              onRemove()
              closeMenu()
            }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}
