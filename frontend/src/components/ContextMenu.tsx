import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  icon?: React.ElementType
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuState & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('contextmenu', handleClick)
    }, 0)
    document.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('contextmenu', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [close])

  // Keep menu on screen
  const menuWidth = 180
  const menuHeight = items.length * 32 + 8
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8)
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8)

  return createPortal(
    <div ref={ref} style={{
      position: 'fixed',
      left: adjustedX,
      top: adjustedY,
      zIndex: 10000,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '4px',
      minWidth: '160px',
      boxShadow: '0 8px 32px var(--overlay)',
      animation: 'fadeInUp 0.1s ease',
    }}>
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={i}
            onClick={() => { item.onClick(); close() }}
            disabled={item.disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '7px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: '5px',
              color: item.danger ? 'var(--red)' : item.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
              fontSize: '12px',
              cursor: item.disabled ? 'default' : 'pointer',
              opacity: item.disabled ? 0.4 : 1,
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            {Icon && <Icon size={14} />}
            {item.label}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
