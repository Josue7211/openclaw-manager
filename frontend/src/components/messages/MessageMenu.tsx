import { useEffect, useRef } from 'react'
import { ArrowBendUpLeft, ArrowCounterClockwise, Copy, Trash } from '@phosphor-icons/react'
import type { Message } from '@/pages/messages/types'

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface MessageMenuState {
  msgGuid: string
  msg: Message
  x: number
  y: number
  fromMe: boolean
}

/* ─── Constants ────────────────────────────────────────────────────────── */

const REACTION_NAMES: { key: string; emoji: string; type: number }[] = [
  { key: 'love', emoji: '❤️', type: 2000 },
  { key: 'like', emoji: '👍', type: 2001 },
  { key: 'dislike', emoji: '👎', type: 2002 },
  { key: 'laugh', emoji: '😂', type: 2003 },
  { key: 'emphasize', emoji: '‼️', type: 2004 },
  { key: 'question', emoji: '❓', type: 2005 },
]

const MENU_WIDTH = 280
const MENU_PAD = 8
const REACTION_BAR_HEIGHT = 50
const MENU_GAP = 6
const ACTION_ROW_HEIGHT = 40
const ACTION_MENU_PAD = 8

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function getMenuBounds() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }

  const rect = document.querySelector<HTMLElement>('[data-messages-menu-bounds]')?.getBoundingClientRect()
  if (rect && rect.width > 0 && rect.height > 0) {
    return rect
  }

  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

/* ─── MButton ────────────────────────────────────────────────────────── */

export function MButton({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        width: '100%', padding: '10px 14px',
        background: 'transparent', border: 'none',
        color: danger ? 'var(--danger, var(--red))' : 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
        cursor: 'pointer', borderRadius: '8px',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--active-bg)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ color: danger ? 'var(--danger, var(--red))' : 'var(--text-secondary)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}

/* ─── MessageMenu ────────────────────────────────────────────────────────── */

function MessageMenu({ x, y, msg, fromMe, onReact, onReply, onCopy, onDelete, onUnsend, onClose }: {
  x: number; y: number
  msg: Message
  fromMe: boolean
  onReact: (reaction: string) => void
  onReply: () => void
  onCopy: () => void
  onDelete: () => void
  onUnsend: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const bounds = getMenuBounds()
  const actionCount = 2 + (msg.text ? 1 : 0) + (fromMe ? 1 : 0)
  const menuHeight = REACTION_BAR_HEIGHT + MENU_GAP + ACTION_MENU_PAD + actionCount * ACTION_ROW_HEIGHT
  const clampedX = clamp(
    x - MENU_WIDTH / 2,
    bounds.left + MENU_PAD,
    bounds.right - MENU_WIDTH - MENU_PAD,
  )
  const clampedY = clamp(
    y - 108,
    bounds.top + MENU_PAD,
    bounds.bottom - menuHeight - MENU_PAD,
  )

  return (
    <>
      <div role="presentation" onClick={onClose} style={{
        position: 'fixed',
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        zIndex: 998,
        background: 'var(--overlay-light)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        animation: 'fadeIn 0.12s ease-out',
      }} />

      <div ref={ref} style={{
        position: 'fixed', left: clampedX, top: clampedY, zIndex: 999,
        display: 'flex', flexDirection: 'column', gap: '6px',
        animation: 'menuIn 0.2s var(--ease-spring)',
      }}>
        <div style={{
          background: 'var(--bg-popover)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid var(--border-hover)',
          borderRadius: '28px',
          padding: '6px 8px',
          display: 'flex', gap: '2px',
          boxShadow: '0 12px 48px var(--overlay-heavy)',
        }}>
          {REACTION_NAMES.map((r, i) => (
            <button
              key={r.key}
              onClick={() => onReact(r.key)}
              aria-label={`React with ${r.emoji}`}
              style={{
                background: 'transparent', border: 'none', borderRadius: '50%',
                width: '40px', height: '36px', fontSize: '22px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: `emojiPop 0.3s var(--ease-spring) ${i * 0.04}s both`,
                transition: 'transform 0.15s var(--ease-spring)',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.35)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {r.emoji}
            </button>
          ))}
        </div>

        <div style={{
          background: 'var(--bg-popover)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid var(--border-hover)',
          borderRadius: '12px',
          padding: '4px',
          boxShadow: '0 8px 32px var(--overlay-light)',
        }}>
          <MButton icon={<ArrowBendUpLeft size={16} />} label="Reply" onClick={onReply} />
          {msg.text && <MButton icon={<Copy size={16} />} label="Copy" onClick={onCopy} />}
          {fromMe && <MButton icon={<ArrowCounterClockwise size={16} />} label="Undo Send" onClick={onUnsend} />}
          <MButton icon={<Trash size={16} />} label="Delete" onClick={onDelete} danger />
        </div>
      </div>
    </>
  )
}

export default MessageMenu
