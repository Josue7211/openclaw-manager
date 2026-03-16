import { useEffect, useRef } from 'react'
import { CornerUpLeft, Copy } from 'lucide-react'

/* ─── Types ────────────────────────────────────────────────────────────── */

interface Reaction {
  type: number
  fromMe: boolean
  handle?: string
}

interface Attachment {
  guid: string
  mimeType: string
  transferName: string
  isSticker?: boolean
  uti?: string
}

interface Message {
  originalROWID?: number
  guid: string
  text: string
  dateCreated: number
  isFromMe: boolean
  isAudioMessage?: boolean
  handle?: { address: string; service: string }
  attachments?: Attachment[]
  balloonBundleId?: string | null
  groupTitle?: string | null
  groupActionType?: number
  itemType?: number
  dateRead?: number | null
  dateDelivered?: number | null
  reactions?: Reaction[]
  threadOriginatorGuid?: string | null
}

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

/* ─── MButton ────────────────────────────────────────────────────────── */

export function MButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        width: '100%', padding: '10px 14px',
        background: 'transparent', border: 'none',
        color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
        cursor: 'pointer', borderRadius: '8px',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--active-bg)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}

/* ─── MessageMenu ────────────────────────────────────────────────────────── */

function MessageMenu({ x, y, msg, onReact, onReply, onCopy, onClose }: {
  x: number; y: number
  msg: Message
  onReact: (reaction: string) => void
  onReply: () => void
  onCopy: () => void
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

  const menuW = 280
  const clampedX = Math.max(8, Math.min(x - menuW / 2, window.innerWidth - menuW - 8))
  const clampedY = Math.max(8, y - 108)

  return (
    <>
      <div role="presentation" onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 998,
        background: 'rgba(0,0,0,0.25)',
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
          <MButton icon={<CornerUpLeft size={16} />} label="Reply" onClick={onReply} />
          {msg.text && <MButton icon={<Copy size={16} />} label="Copy" onClick={onCopy} />}
        </div>
      </div>
    </>
  )
}

export default MessageMenu
