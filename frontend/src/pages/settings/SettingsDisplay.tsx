/**
 * SettingsDisplay -- comprehensive theme management panel with card-based layout.
 *
 * Self-contained: reads from useThemeState() directly, no props.
 * Sections: mode selector, theme presets, compact colors, fonts + live preview,
 * advanced sliders (glow, radius, opacity), reset, branding, import/export,
 * scheduling, and custom CSS.
 */

import { useState, useCallback, memo, useMemo } from 'react'
import { Sun, Moon, Laptop, Palette, TextT, SlidersHorizontal } from '@phosphor-icons/react'

import { BUILT_IN_THEMES, getThemeById } from '@/lib/theme-definitions'
import { resolveThemeDefinition } from '@/lib/theme-engine'
import {
  useThemeState,
  setMode,
  setActiveTheme,
  setAccentOverride,
  setGlowOverride,
  setSecondaryOverride,
  setTertiaryOverride,
  setLogoOverride,
  setGlowOpacity,
  setBorderRadius,
  setPanelOpacity,
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
import { btnSecondary } from './shared'
import { PushPin, PushPinSlash, Trash, ArrowCounterClockwise } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// SettingsCard — reusable card wrapper for section grouping
// ---------------------------------------------------------------------------

function SettingsCard({ title, icon, children }: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--bg-card-solid)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px',
      marginBottom: '12px',
    }}>
      <h3 style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        margin: '0 0 14px 0',
      }}>
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

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

      {/* Hover actions */}
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
// Color item for compact color grid
// ---------------------------------------------------------------------------

type ColorKey = 'accent' | 'secondary' | 'tertiary' | 'glow' | 'logo'

const COLOR_ITEMS: ReadonlyArray<{
  key: ColorKey
  label: string
  description: string
}> = [
  { key: 'accent', label: 'Primary Accent', description: 'Buttons, links, active states' },
  { key: 'secondary', label: 'Secondary (Status)', description: 'Success, online, completed' },
  { key: 'tertiary', label: 'Tertiary (Accent Blue)', description: 'Chat bubbles, dashboard' },
  { key: 'glow', label: 'Glow Color', description: 'Top gradient glow' },
  { key: 'logo', label: 'Logo Color', description: 'Sidebar logo tint' },
]

const COLOR_SETTERS: Record<ColorKey, (color: string) => void> = {
  accent: setAccentOverride,
  secondary: setSecondaryOverride,
  tertiary: setTertiaryOverride,
  glow: setGlowOverride,
  logo: setLogoOverride,
}

// ---------------------------------------------------------------------------
// SliderRow — labeled range slider with value display
// ---------------------------------------------------------------------------

function SliderRow({ label, value, min, max, step, unit, onChange, ariaLabel }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
  ariaLabel: string
}) {
  const displayValue = unit === '%'
    ? `${Math.round(value * 100)}%`
    : `${value}${unit}`

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
      }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          fontFamily: 'monospace',
          minWidth: '40px',
          textAlign: 'right',
        }}>
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        aria-label={ariaLabel}
        style={{
          width: '100%',
          accentColor: 'var(--accent)',
          cursor: 'pointer',
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsDisplay
// ---------------------------------------------------------------------------

export default function SettingsDisplay() {
  const state = useThemeState()
  const overrides = state.overrides[state.activeThemeId]
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [expandedPicker, setExpandedPicker] = useState<ColorKey | null>(null)

  // Resolve current theme definition
  const currentTheme = getThemeById(state.activeThemeId) ??
    state.customThemes.find(t => t.id === state.activeThemeId)
  const resolvedTheme = resolveThemeDefinition(state)
  const isLight = resolvedTheme.category === 'light'

  // Get current color values (theme base + overrides)
  const currentColors: Record<ColorKey, string> = useMemo(() => ({
    accent: overrides?.accent ?? currentTheme?.colors['accent'] ?? '#a78bfa',
    secondary: overrides?.secondary ?? currentTheme?.colors['green'] ?? '#34d399',
    tertiary: overrides?.tertiary ?? currentTheme?.colors['accent-secondary'] ?? (overrides?.accent ?? currentTheme?.colors['accent'] ?? '#a78bfa'),
    glow: overrides?.glow ?? currentTheme?.colors['glow-top-rgb'] ?? '#8b5cf6',
    logo: overrides?.logo ?? (overrides?.accent ?? currentTheme?.colors['accent'] ?? '#a78bfa'),
  }), [overrides, currentTheme])

  // Slider values from overrides with defaults
  const glowOpacity = overrides?.glowOpacity ?? (isLight ? 0.06 : 0.10)
  const borderRadius = overrides?.borderRadius ?? 12
  const panelOpacity = overrides?.panelOpacity ?? 0.6

  // All themes: built-in + custom, pinned first
  const allThemes = useMemo(() => {
    const combined = [
      ...BUILT_IN_THEMES.map(t => ({ ...t })),
      ...state.customThemes.map(t => ({ ...t })),
    ]
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
    setExpandedPicker(null)
  }, [state.activeThemeId])

  return (
    <div>
      {/* 1. Appearance — Mode Selector */}
      <SettingsCard title="Appearance" icon={<Moon size={16} weight="duotone" />}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Theme Mode</span>
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
      </SettingsCard>

      {/* 2. Theme Presets */}
      <SettingsCard title="Theme Presets">
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
      </SettingsCard>

      {/* 3. Colors — compact grid */}
      <SettingsCard title="Colors" icon={<Palette size={16} weight="duotone" />}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
        }}>
          {COLOR_ITEMS.map(({ key, label, description }) => {
            const color = currentColors[key]
            const isExpanded = expandedPicker === key
            return (
              <div key={key} style={{
                gridColumn: isExpanded ? '1 / -1' : undefined,
              }}>
                <button
                  onClick={() => setExpandedPicker(isExpanded ? null : key)}
                  aria-label={`Edit ${label} color`}
                  aria-expanded={isExpanded}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '8px',
                    background: isExpanded ? 'var(--hover-bg)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: color,
                    border: '2px solid var(--border-hover)',
                    flexShrink: 0,
                  }} />
                  <div style={{ textAlign: 'left', minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      fontFamily: 'monospace',
                    }}>
                      {color}
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div style={{ padding: '12px 0 4px 0' }}>
                    <AccentPicker
                      color={color}
                      onChange={COLOR_SETTERS[key]}
                      label={label}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SettingsCard>

      {/* 4. Typography — fonts + live preview */}
      <SettingsCard title="Typography" icon={<TextT size={16} weight="duotone" />}>
        <FontPicker />
        <div style={{
          marginTop: '14px',
          padding: '16px',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '10px',
            fontFamily: 'monospace',
          }}>
            Live Preview
          </div>
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)',
            marginBottom: '6px',
          }}>
            The quick brown fox
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            color: 'var(--text-secondary)',
            marginBottom: '6px',
          }}>
            jumps over the lazy dog -- 0123456789
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}>
            {'const greeting = "Hello, World!"'}
          </div>
        </div>
      </SettingsCard>

      {/* 5. Advanced — sliders */}
      <SettingsCard title="Advanced" icon={<SlidersHorizontal size={16} weight="duotone" />}>
        <SliderRow
          label="Glow Brightness"
          value={glowOpacity}
          min={0}
          max={0.25}
          step={0.01}
          unit="%"
          onChange={setGlowOpacity}
          ariaLabel="Glow brightness intensity"
        />
        <SliderRow
          label="Border Radius"
          value={borderRadius}
          min={0}
          max={24}
          step={1}
          unit="px"
          onChange={setBorderRadius}
          ariaLabel="Border radius for cards and panels"
        />
        <SliderRow
          label="Panel Opacity"
          value={panelOpacity}
          min={0.4}
          max={1.0}
          step={0.05}
          unit="%"
          onChange={setPanelOpacity}
          ariaLabel="Glass panel background opacity"
        />
      </SettingsCard>

      {/* 6. Reset to Default */}
      <div style={{ marginBottom: '12px' }}>
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
            background: 'var(--bg-card-solid)',
            borderRadius: 'var(--radius-md)',
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

      {/* 7. Branding */}
      <SettingsCard title="Branding">
        <BrandingSettings />
      </SettingsCard>

      {/* 8. Import & Export */}
      <SettingsCard title="Import & Export">
        <ThemeImportExport />
      </SettingsCard>

      {/* 9. Schedule */}
      <SettingsCard title="Schedule">
        <ThemeScheduler />
      </SettingsCard>

      {/* 10. Custom CSS */}
      <SettingsCard title="Custom CSS">
        <CustomCssEditor />
      </SettingsCard>
    </div>
  )
}
