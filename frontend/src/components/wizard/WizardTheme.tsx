/**
 * WizardTheme -- Theme selection step with 8-preset grid and mode selector.
 *
 * Mode selector: Dark / Light / System segmented control.
 * 8 curated presets with mini UI mockup, color swatches, and WYSIWYG live preview.
 * Selecting a theme applies it globally via setActiveTheme for immediate feedback.
 */

import React, { useCallback, useRef, useMemo } from 'react'
import { Moon, Sun, Laptop } from '@phosphor-icons/react'
import {
  useWizardState,
  updateWizardField,
} from '@/lib/wizard-store'
import { setActiveTheme, setMode } from '@/lib/theme-store'
import { BUILT_IN_THEMES, type ThemeDefinition } from '@/lib/theme-definitions'

// ---------------------------------------------------------------------------
// 8 curated wizard presets
// ---------------------------------------------------------------------------

const WIZARD_PRESET_IDS = [
  'default-dark',
  'dracula',
  'nord',
  'catppuccin-mocha',
  'default-light',
  'solarized-light',
  'catppuccin-latte',
  'rose-pine',
] as const

function getWizardPresets(): ThemeDefinition[] {
  const found = WIZARD_PRESET_IDS
    .map(id => BUILT_IN_THEMES.find(t => t.id === id))
    .filter(Boolean) as ThemeDefinition[]
  // Fallback to first 8 if any IDs don't match
  if (found.length < 8) {
    return BUILT_IN_THEMES.slice(0, 8) as ThemeDefinition[]
  }
  return found
}

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

const MODES = [
  { key: 'dark' as const, label: 'Dark', Icon: Moon },
  { key: 'light' as const, label: 'Light', Icon: Sun },
  { key: 'system' as const, label: 'System', Icon: Laptop },
]

// ---------------------------------------------------------------------------
// Mini UI Mockup: renders a tiny abstract representation using theme colors
// ---------------------------------------------------------------------------

function ThemeMockup({ theme }: { theme: ThemeDefinition }) {
  const c = theme.colors
  const bgBase = c['bg-base'] || c.background || '#0a0a0c'
  const bgSidebar = c['bg-sidebar'] || c['bg-card'] || c['bg-card-solid'] || '#16161c'
  const bgCard = c['bg-card-solid'] || c['bg-card'] || '#1e1e24'
  const accent = c.accent || '#7c5bf5'

  return (
    <div
      style={{
        width: '100%',
        height: '80px',
        borderRadius: '8px 8px 0 0',
        overflow: 'hidden',
        position: 'relative',
        background: bgBase,
      }}
    >
      {/* Sidebar bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '30%',
          height: '100%',
          background: bgSidebar,
        }}
      >
        {/* Sidebar items */}
        {[16, 30, 44].map(top => (
          <div
            key={top}
            style={{
              position: 'absolute',
              top,
              left: 6,
              right: 6,
              height: 6,
              borderRadius: 3,
              background: bgCard,
            }}
          />
        ))}
      </div>

      {/* Main area cards */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '34%',
          right: 8,
          bottom: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            flex: 1,
            borderRadius: 4,
            background: bgCard,
          }}
        />
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <div style={{ flex: 1, borderRadius: 4, background: bgCard }} />
          <div style={{ flex: 1, borderRadius: 4, background: bgCard }} />
        </div>
      </div>

      {/* Accent dot */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 10,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: accent,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Color swatches row
// ---------------------------------------------------------------------------

function SwatchRow({ theme }: { theme: ThemeDefinition }) {
  const c = theme.colors
  const swatches = [
    c['bg-base'] || '#0a0a0c',
    c['bg-card-solid'] || c['bg-card'] || '#16161c',
    c.accent || '#7c5bf5',
    c['text-primary'] || '#e4e4ec',
    c.green || c['green-500'] || '#34d399',
  ]

  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6 }}>
      {swatches.map((color, i) => (
        <div
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            border: '1px solid rgba(128,128,128,0.2)',
          }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Theme card
// ---------------------------------------------------------------------------

function ThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: ThemeDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        width: 'min(160px, calc(25% - 12px))',
        flex: '1 1 min(160px, calc(25% - 12px))',
        minWidth: 120,
        padding: 0,
        border: selected
          ? '2px solid var(--accent)'
          : '1px solid var(--border)',
        borderRadius: '12px',
        background: 'var(--bg-card-solid)',
        cursor: 'pointer',
        overflow: 'hidden',
        transition:
          'transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out), border-color 0.2s var(--ease-out)',
        boxShadow: selected
          ? '0 0 12px rgba(var(--accent-rgb, 124,91,245), 0.2)'
          : '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        outline: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = selected
          ? '0 0 16px rgba(var(--accent-rgb, 124,91,245), 0.3)'
          : '0 4px 12px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = selected
          ? '0 0 12px rgba(var(--accent-rgb, 124,91,245), 0.2)'
          : '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)'
      }}
      onFocus={e => {
        e.currentTarget.style.boxShadow =
          '0 0 0 2px var(--accent), 0 0 12px rgba(var(--accent-rgb, 124,91,245), 0.2)'
      }}
      onBlur={e => {
        e.currentTarget.style.boxShadow = selected
          ? '0 0 12px rgba(var(--accent-rgb, 124,91,245), 0.2)'
          : '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)'
      }}
    >
      {/* Mini UI mockup */}
      <ThemeMockup theme={theme} />

      {/* Theme name + swatches */}
      <div style={{ padding: '8px 8px 10px' }}>
        <div
          style={{
            fontSize: '15px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          {theme.name}
        </div>
        <SwatchRow theme={theme} />
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WizardTheme() {
  const wizard = useWizardState()
  const gridRef = useRef<HTMLDivElement>(null)
  const presets = useMemo(() => getWizardPresets(), [])

  const handleModeChange = useCallback(
    (mode: 'dark' | 'light' | 'system') => {
      updateWizardField('selectedMode', mode)
      setMode(mode)
    },
    [],
  )

  const handleThemeSelect = useCallback(
    (themeId: string) => {
      updateWizardField('selectedThemeId', themeId)
      setActiveTheme(themeId)
    },
    [],
  )

  // Arrow key navigation within theme radiogroup
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      e.preventDefault()

      const currentIdx = presets.findIndex(t => t.id === wizard.selectedThemeId)
      if (currentIdx === -1) return

      let nextIdx = currentIdx
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = (currentIdx + 1) % presets.length
      } else {
        nextIdx = (currentIdx - 1 + presets.length) % presets.length
      }

      const nextTheme = presets[nextIdx]
      handleThemeSelect(nextTheme.id)

      // Focus the new card
      const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      buttons?.[nextIdx]?.focus()
    },
    [presets, wizard.selectedThemeId, handleThemeSelect],
  )

  return (
    <div style={{ width: '100%' }}>
      {/* Heading */}
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: '0 0 4px',
        }}
      >
        Pick a Theme
      </h2>
      <p
        style={{
          fontSize: '15px',
          color: 'var(--text-secondary)',
          margin: '0 0 var(--space-6, 24px)',
        }}
      >
        You can customize this further in Settings.
      </p>

      {/* Mode selector */}
      <div
        role="radiogroup"
        aria-label="Theme mode"
        style={{
          display: 'inline-flex',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
          marginBottom: 'var(--space-6, 24px)',
        }}
      >
        {MODES.map(({ key, label, Icon }) => {
          const active = wizard.selectedMode === key
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              onClick={() => handleModeChange(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                border: 'none',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 400,
                fontSize: '15px',
                cursor: 'pointer',
                transition: 'all 0.2s var(--ease-out)',
              }}
            >
              <Icon size={16} weight={active ? 'fill' : 'regular'} />
              {label}
            </button>
          )
        })}
      </div>

      {/* 8-preset grid */}
      <div
        ref={gridRef}
        role="radiogroup"
        aria-label="Theme presets"
        onKeyDown={handleGridKeyDown}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4, 16px)',
          justifyContent: 'center',
        }}
      >
        {presets.map(theme => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            selected={wizard.selectedThemeId === theme.id}
            onSelect={() => handleThemeSelect(theme.id)}
          />
        ))}
      </div>
    </div>
  )
}
