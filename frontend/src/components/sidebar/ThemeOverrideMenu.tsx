import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { BUILT_IN_THEMES } from '@/lib/theme-definitions'
import {
  clearCategoryOverride,
  clearPageOverride,
  setCategoryOverride,
  setPageOverride,
} from '@/lib/theme-store'

interface ThemeOverrideMenuProps {
  x: number
  y: number
  type: 'page' | 'category'
  targetId: string
  currentOverrideId?: string
  onClose: () => void
}

const ThemeOverrideMenu = React.memo(function ThemeOverrideMenu({
  x,
  y,
  type,
  targetId,
  currentOverrideId,
  onClose,
}: ThemeOverrideMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)
    document.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(timer)
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
    <div
      ref={ref}
      role="menu"
      style={{
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
      }}
    >
      <div
        style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          padding: '4px 8px 6px',
        }}
      >
        {heading}
      </div>

      <button
        role="menuitemradio"
        aria-checked={!currentOverrideId}
        onClick={handleClear}
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
        onMouseEnter={e => {
          if (currentOverrideId) e.currentTarget.style.background = 'var(--hover-bg)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = !currentOverrideId ? 'var(--accent-a10, rgba(167, 139, 250, 0.1))' : 'transparent'
        }}
      >
        Use global theme
      </button>

      <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

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
            onMouseEnter={e => {
              if (!isSelected) e.currentTarget.style.background = 'var(--hover-bg)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isSelected ? 'var(--accent-a10, rgba(167, 139, 250, 0.1))' : 'transparent'
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: theme.colors['accent'] || '#a78bfa',
                flexShrink: 0,
              }}
            />
            {theme.name}
          </button>
        )
      })}
    </div>,
    document.body,
  )
})

export default ThemeOverrideMenu
