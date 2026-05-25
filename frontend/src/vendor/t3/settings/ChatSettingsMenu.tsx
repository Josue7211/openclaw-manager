/*
 * Copied/adapted from T3 Code's sidebar account/settings popover surface.
 * ClawControl supplies the destination shortcuts, while the chat page consumes
 * this as a vendor UI chunk instead of keeping a bespoke inline menu.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CaretRight, Gear, GitDiff, Info, SlidersHorizontal } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { CHAT_SETTINGS_SHORTCUTS, type ChatSettingsShortcut } from '@/chat/t3-adapters/settingsShortcuts'

function settingsShortcutIcon(shortcut: ChatSettingsShortcut) {
  if (shortcut.id === 'usage') return <Info size={13} />
  if (shortcut.id === 'providers') return <SlidersHorizontal size={13} />
  if (shortcut.id === 'hermes-agent') return <GitDiff size={13} />
  return <Gear size={13} />
}

function useDismissibleSettingsMenu(open: boolean, setOpen: (open: boolean) => void) {
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
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, setOpen])

  return containerRef
}

function SettingsMenuButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="hover-bg"
      style={{
        height: 28,
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--text-secondary)',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: 8,
        padding: '0 7px',
        font: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
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

export default function ChatSettingsMenu() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useDismissibleSettingsMenu(open, setOpen)
  const go = (href: string) => {
    setOpen(false)
    navigate(href)
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="hover-bg"
        aria-label="Settings menu"
        aria-expanded={open}
        style={{
          height: 34,
          border: 'none',
          borderRadius: 8,
          background: 'transparent',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 10px',
          font: 'inherit',
          fontSize: 14,
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <Gear size={16} />
        <span>Settings</span>
        <CaretRight size={13} style={{ marginLeft: 'auto' }} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Settings shortcuts"
          data-t3-settings-account-menu
          style={{
            position: 'absolute',
            zIndex: 28,
            left: 0,
            bottom: 38,
            width: 230,
            display: 'grid',
            gap: 4,
            padding: 6,
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--bg-panel)',
            boxShadow: '0 16px 34px rgba(0, 0, 0, 0.32)',
          }}
        >
          {CHAT_SETTINGS_SHORTCUTS.map((shortcut) => (
            <SettingsMenuButton
              key={shortcut.id}
              label={shortcut.label}
              icon={settingsShortcutIcon(shortcut)}
              onClick={() => go(shortcut.href)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
