/**
 * SettingsDisplay -- comprehensive theme management panel.
 *
 * Self-contained: reads from useThemeState() directly, no props.
 * Includes mode selector, theme presets grid, color pickers, fonts,
 * branding, import/export, scheduling, and custom CSS.
 */

import { useState, useCallback, memo, useMemo } from 'react'
import { Sun, Moon, Laptop } from '@phosphor-icons/react'

import { BUILT_IN_THEMES, getThemeById } from '@/lib/theme-definitions'
import {
  useThemeState,
  setMode,
  setActiveTheme,
  setAccentOverride,
  setGlowOverride,
  setSecondaryOverride,
  setLogoOverride,
  resetThemeOverrides,
  removeCustomTheme,
  pinTheme,
  unpinTheme,
} from '@/lib/theme-store'
import AccentPicker from '@/components/AccentPicker'
import FontPicker from '@/components/FontPicker'
import BrandingSettings from '@/components/BrandingSettings'
import ThemeImportExport from '@/components/ThemeImportExport'
import ThemeScheduler from '@/components/ThemeScheduler'
import CustomCssEditor from '@/components/CustomCssEditor'
import { row, sectionLabel, btnSecondary } from './shared'
import { PushPin, PushPinSlash, Trash, ArrowCounterClockwise } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// Mode options
// ---------------------------------------------------------------------------

const MODE_OPTIONS = [
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'system' as const, icon: Laptop, label: 'System' },
] as const

// ---------------------------------------------------------------------------
// ThemeCard -- small preview card for the preset grid
// ---------------------------------------------------------------------------

const ThemeCard = memo(function ThemeCard({
  theme,
  active,
  isPinned,
  isCustom,
  onClick,
  onPin,
  onUnpin,
  onDelete,
}: {
  theme: { id: string; name: string; colors: Record<string, string> }
  active: boolean
  isPinned: boolean
  isCustom: boolean
  onClick: (e: React.MouseEvent) => void
  onPin?: () => void
  onUnpin?: () => void
  onDelete?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const bg = theme.colors['bg-base'] || '#0a0a0c'
  const accent = theme.colors['accent'] || '#a78bfa'
  const text = theme.colors['text-primary'] || '#e4e4ec'
  const border = active ? accent : 'var(--border)'

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        aria-label={`${theme.name} theme${active ? ' (active)' : ''}`}
        aria-pressed={active}
        style={{
          width: '100%',
          padding: '10px',
          background: bg,
          border: `2px solid ${border}`,
          borderRadius: '10px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          transition: 'border-color 0.15s ease, transform 0.15s ease',
          transform: active ? 'scale(1.02)' : 'scale(1)',
          outline: active ? `2px solid ${accent}` : 'none',
          outlineOffset: '2px',
          minHeight: '60px',
        }}
      >
        {/* Color preview dots */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: text, opacity: 0.6 }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.colors['green'] || '#34d399' }} />
        </div>
        <span style={{
          fontSize: '11px',
          fontWeight: active ? 600 : 400,
          color: text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: 'left',
          width: '100%',
        }}>
          {theme.name}
        </span>
      </button>

      {/* Hover actions for custom themes */}
      {hovered && (isCustom || isPinned || (!isCustom && !isPinned)) && (
        <div style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          display: 'flex',
          gap: '2px',
        }}>
          {isPinned ? (
            <button
              onClick={e => { e.stopPropagation(); onUnpin?.() }}
              aria-label={`Unpin ${theme.name}`}
              title="Unpin"
              style={miniActionBtnStyle}
            >
              <PushPinSlash size={12} />
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onPin?.() }}
              aria-label={`Pin ${theme.name}`}
              title="Pin"
              style={miniActionBtnStyle}
            >
              <PushPin size={12} />
            </button>
          )}
          {isCustom && (
            <button
              onClick={e => { e.stopPropagation(); onDelete?.() }}
              aria-label={`Delete ${theme.name}`}
              title="Delete"
              style={{ ...miniActionBtnStyle, color: 'var(--red)' }}
            >
              <Trash size={12} />
            </button>
          )}
        </div>
      )}

      {/* Pin indicator */}
      {isPinned && !hovered && (
        <div style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          color: accent,
          opacity: 0.6,
        }}>
          <PushPin size={10} />
        </div>
      )}
    </div>
  )
})

const miniActionBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '3px',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
}

// ---------------------------------------------------------------------------
// SettingsDisplay
// ---------------------------------------------------------------------------

export default function SettingsDisplay() {
  const state = useThemeState()
  const overrides = state.overrides[state.activeThemeId]
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Get current color values (theme base + overrides)
  const currentTheme = getThemeById(state.activeThemeId) ??
    state.customThemes.find(t => t.id === state.activeThemeId)

  const currentAccent = overrides?.accent ?? currentTheme?.colors['accent'] ?? '#a78bfa'
  const currentSecondary = overrides?.secondary ?? currentTheme?.colors['accent-dim'] ?? '#818cf8'
  const currentGlow = overrides?.glow ?? currentTheme?.colors['glow-top-rgb'] ?? '#8b5cf6'
  const currentLogo = overrides?.logo ?? currentAccent

  // All themes: built-in + custom, pinned first
  const allThemes = useMemo(() => {
    const combined = [
      ...BUILT_IN_THEMES.map(t => ({ ...t })),
      ...state.customThemes.map(t => ({ ...t })),
    ]
    // Sort: pinned themes first
    return combined.sort((a, b) => {
      const aPinned = state.overrides[a.id]?.pinned ? 1 : 0
      const bPinned = state.overrides[b.id]?.pinned ? 1 : 0
      return bPinned - aPinned
    })
  }, [state.customThemes, state.overrides])

  // Reset handler
  const handleReset = useCallback(() => {
    resetThemeOverrides(state.activeThemeId)
    setShowResetConfirm(false)
  }, [state.activeThemeId])

  return (
    <div>
      {/* ── Display heading ── */}
      <div style={sectionLabel}>Display</div>

      {/* ── Mode selector ── */}
      <div style={row}>
        <span>Theme Mode</span>
        <div style={{
          display: 'flex',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          {MODE_OPTIONS.map(({ value, icon: Icon, label }) => {
            const active = state.mode === value
            return (
              <button
                key={value}
                onClick={() => setMode(value)}
                aria-label={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: active ? 600 : 400,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Theme Presets grid ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          fontWeight: 500,
          marginBottom: '10px',
          display: 'block',
        }}>
          Theme Presets
        </span>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: '8px',
        }}>
          {allThemes.map(theme => {
            const active = state.activeThemeId === theme.id
            const isPinned = state.overrides[theme.id]?.pinned ?? false
            const isCustom = !theme.builtIn
            return (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={active}
                isPinned={isPinned}
                isCustom={isCustom}
                onClick={(e) => setActiveTheme(theme.id, { clientX: e.clientX, clientY: e.clientY })}
                onPin={() => pinTheme(theme.id)}
                onUnpin={() => unpinTheme(theme.id)}
                onDelete={isCustom ? () => {
                  removeCustomTheme(theme.id)
                  if (active) setActiveTheme('default-dark')
                } : undefined}
              />
            )
          })}
        </div>
      </div>

      {/* ── Accent color ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <AccentPicker color={currentAccent} onChange={setAccentOverride} label="Accent" />
      </div>

      {/* ── Secondary color ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <AccentPicker color={currentSecondary} onChange={setSecondaryOverride} label="Secondary" />
      </div>

      {/* ── Glow color ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <AccentPicker color={currentGlow} onChange={setGlowOverride} label="Glow" />
      </div>

      {/* ── Logo color ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <AccentPicker color={currentLogo} onChange={setLogoOverride} label="Logo" />
      </div>

      {/* ── Reset to Default ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowCounterClockwise size={14} />
            Reset to Default
          </button>
        ) : (
          <div style={{
            padding: '12px',
            background: 'var(--bg-card)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 10px 0' }}>
              Reset {currentTheme?.name ?? 'theme'} to factory settings? Your customizations for this theme will be lost.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleReset}
                style={{
                  ...btnSecondary,
                  color: 'var(--red)',
                  borderColor: 'var(--red)',
                }}
              >
                Reset
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={btnSecondary}
              >
                Keep Changes
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Fonts ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <FontPicker />
      </div>

      {/* ── Branding ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <BrandingSettings />
      </div>

      {/* ── Import/Export ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <ThemeImportExport />
      </div>

      {/* ── Schedule ── */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={sectionLabel}>Schedule</div>
        <ThemeScheduler />
      </div>

      {/* ── Custom CSS ── */}
      <div style={{ padding: '12px 0' }}>
        <div style={sectionLabel}>Custom CSS</div>
        <CustomCssEditor />
      </div>
    </div>
  )
}
