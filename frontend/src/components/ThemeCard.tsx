import React from 'react'
import { Trash, PushPin } from '@phosphor-icons/react'
import type { ThemeDefinition } from '@/lib/theme-definitions'

interface ThemeCardProps {
  theme: ThemeDefinition
  isActive: boolean
  isPinned?: boolean
  isCustom?: boolean
  onClick: (e: React.MouseEvent) => void
  onDelete?: () => void
}

/**
 * rgbaToHex — extract a hex color from an rgba() string for swatch display.
 * Returns the first 3 numeric components as a hex value. Falls back to input if not rgba.
 */
function rgbaToHex(val: string): string {
  const m = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return val
  const [, r, g, b] = m
  return '#' + [r, g, b].map(c => Number(c).toString(16).padStart(2, '0')).join('')
}

/**
 * rgbStringToHex — convert a glow-top-rgb value like "139, 92, 246" to "#8b5cf6"
 */
function rgbStringToHex(val: string): string {
  const parts = val.split(',').map(s => s.trim())
  if (parts.length < 3) return '#888888'
  return '#' + parts.slice(0, 3).map(c => Number(c).toString(16).padStart(2, '0')).join('')
}

const ThemeCard = React.memo(function ThemeCard({
  theme,
  isActive,
  isPinned,
  isCustom,
  onClick,
  onDelete,
}: ThemeCardProps) {
  const swatchColors = [
    theme.colors['bg-base'],
    theme.colors['bg-card'] ? rgbaToHex(theme.colors['bg-card']) : '#1a1a1a',
    theme.colors['accent'],
    theme.colors['text-primary'],
    theme.colors['glow-top-rgb'] ? rgbStringToHex(theme.colors['glow-top-rgb']) : '#888888',
  ]

  const gradientBg = `linear-gradient(135deg, ${theme.colors['bg-base']}, ${theme.colors['accent']})`

  return (
    <button
      role="radio"
      aria-checked={isActive}
      aria-label={`${theme.name} theme`}
      onClick={onClick}
      className="theme-card"
      style={{
        width: 'min(160px, calc(25% - 12px))',
        minWidth: 130,
        background: 'var(--bg-card)',
        border: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        boxShadow: isActive ? '0 0 0 2px var(--accent-a30)' : 'none',
        borderRadius: 'var(--radius-lg)',
        padding: 0,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'left',
        color: 'var(--text-primary)',
        transition: 'transform 200ms ease-out, box-shadow 200ms ease-out, background 200ms ease-out',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Pin indicator */}
      {isPinned && (
        <span
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 2,
            color: 'var(--accent)',
            opacity: 0.8,
          }}
          aria-label="Pinned"
        >
          <PushPin size={14} weight="fill" />
        </span>
      )}

      {/* Delete icon for custom themes */}
      {isCustom && onDelete && (
        <button
          className="theme-card-delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label={`Delete ${theme.name}`}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 4,
            cursor: 'pointer',
            color: 'var(--red)',
            opacity: 0,
            transition: 'opacity 200ms ease-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trash size={14} weight="bold" />
        </button>
      )}

      {/* Artwork area */}
      <div
        style={{
          height: 200,
          background: theme.artwork ? `url(${theme.artwork}) center/cover` : gradientBg,
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          flexShrink: 0,
        }}
      />

      {/* Name + swatches */}
      <div style={{ padding: 'var(--space-2) var(--space-2) var(--space-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{
          fontSize: 'var(--text-base)',
          fontWeight: 500,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {theme.name}
        </span>

        {/* Color swatch row */}
        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
          {swatchColors.map((color, i) => (
            <span
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
                border: '1px solid var(--border)',
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        .theme-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-medium);
          background: var(--bg-card-hover) !important;
        }
        .theme-card:hover .theme-card-delete {
          opacity: 1 !important;
        }
      `}</style>
    </button>
  )
})

export default ThemeCard
