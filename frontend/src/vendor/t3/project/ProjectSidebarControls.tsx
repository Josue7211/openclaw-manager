/*
 * Copied/adapted from T3 Code's sidebar project menu controls.
 * ClawControl wires these into its chat sidebar so project view/action menus
 * live with the copied project UI surface instead of inside Chat.tsx.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
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

export function useDismissibleMenu(open: boolean, setOpen: (open: boolean) => void) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, setOpen])

  return containerRef
}

function ProjectSidebarHeaderButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
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
          background: 'var(--bg-card)',
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
  const menuRef = useDismissibleMenu(open, setOpen)

  return (
    <div ref={menuRef} style={{ position: 'relative', width: 24, height: 22 }}>
      <ProjectSidebarHeaderButton
        label="Project view options"
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={14} />
      </ProjectSidebarHeaderButton>
      {open && (
        <div
          role="menu"
          aria-label="Project view options"
          data-t3-project-view-menu
          style={{
            position: 'absolute',
            zIndex: 24,
            right: 0,
            top: 25,
            width: 196,
            display: 'grid',
            gap: 7,
            padding: 7,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg-panel)',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
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
        </div>
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
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (disabled) return
        onClick()
      }}
      className="hover-bg"
      style={{
        height: 28,
        border: 'none',
        borderRadius: 6,
        background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
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
  disabled = false,
  active = false,
  danger = false,
  size = 22,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  active?: boolean
  danger?: boolean
  size?: number
}) {
  return (
    <button
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
        background: active ? 'color-mix(in srgb, var(--accent) 16%, var(--bg-card))' : 'var(--bg-card)',
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
  const menuRef = useDismissibleMenu(open, setOpen)
  const closeMenu = () => {
    setOpen(false)
  }
  const iconSize = compact ? 12 : 13

  return (
    <div
      ref={menuRef}
      style={{ position: 'relative', width: 22, height: 22 }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={`More actions for ${label}`}
        title={`More actions for ${label}`}
        aria-expanded={open}
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
          background: 'var(--bg-card)',
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
      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${label}`}
          data-t3-project-action-menu
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
          <label style={{
            height: 28,
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            alignItems: 'center',
            gap: 8,
            padding: '0 7px',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}>
            <GitBranch size={13} />
            <select
              aria-label={groupingLabel}
              title={groupingLabel}
              value={groupingValue}
              onChange={(event) => onGroupingChange(event.target.value)}
              style={{
                minWidth: 0,
                width: '100%',
                height: 24,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                font: 'inherit',
                fontSize: 11,
                padding: '0 5px',
              }}
            >
              <option value="">Default grouping</option>
              <option value="repository">Group by repo</option>
              <option value="repository-path">Repo + path</option>
              <option value="separate">Separate root</option>
            </select>
          </label>
          <ProjectMenuButton
            label={removeLabel}
            danger
            icon={<Trash size={13} />}
            onClick={() => {
              onRemove()
              closeMenu()
            }}
          />
        </div>
      )}
    </div>
  )
}
