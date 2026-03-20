import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Moon, Sun, Laptop } from '@phosphor-icons/react'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { BUILT_IN_THEMES } from '@/lib/theme-definitions'
import type { ThemeDefinition } from '@/lib/theme-definitions'
import { useThemeState, setActiveTheme, setMode, setAccentOverride } from '@/lib/theme-store'
import ThemeCard from './ThemeCard'
import AccentPicker from './AccentPicker'

interface ThemePickerProps {
  open: boolean
  onClose: () => void
}

const CATEGORY_ORDER = ['dark', 'light', 'colorful', 'high-contrast'] as const
const CATEGORY_LABELS: Record<string, string> = {
  dark: 'Dark',
  light: 'Light',
  colorful: 'Colorful',
  'high-contrast': 'High Contrast',
}

/**
 * ThemePicker modal -- opened via Super+Shift+T keybinding.
 * Displays all built-in and custom themes in a categorized grid with search,
 * mode selector, and accent picker.
 */
export default function ThemePicker({ open, onClose }: ThemePickerProps) {
  const state = useThemeState()
  const [search, setSearch] = useState('')
  const [closing, setClosing] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const trapRef = useFocusTrap(open && !closing)
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search input when opened
  useEffect(() => {
    if (open && searchRef.current) {
      // Small delay to allow focus trap to initialize
      requestAnimationFrame(() => searchRef.current?.focus())
    }
    if (open) {
      setSearch('')
      setClosing(false)
    }
  }, [open])

  // Handle escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        handleClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClose()
    }, 150)
  }, [onClose])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }, [handleClose])

  const handleThemeClick = useCallback((theme: ThemeDefinition, e: React.MouseEvent) => {
    setActiveTheme(theme.id, { clientX: e.clientX, clientY: e.clientY })
    setAnnouncement(`Theme changed to ${theme.name}`)
  }, [])

  const handleModeChange = useCallback((mode: 'dark' | 'light' | 'system') => {
    setMode(mode)
  }, [])

  // Combine built-in + custom themes
  const allThemes = useMemo(() => {
    const custom = state.customThemes || []
    return [...BUILT_IN_THEMES, ...custom]
  }, [state.customThemes])

  // Filter by mode + search
  const filteredThemes = useMemo(() => {
    // Filter by active mode: dark → dark/colorful, light → light, system → show all
    let modeFiltered = allThemes
    if (state.mode === 'dark') {
      modeFiltered = allThemes.filter(t =>
        t.category === 'dark' || t.category === 'colorful' ||
        (t.category === 'high-contrast' && t.id.includes('dark'))
      )
    } else if (state.mode === 'light') {
      modeFiltered = allThemes.filter(t =>
        t.category === 'light' ||
        (t.category === 'high-contrast' && t.id.includes('light'))
      )
    }
    // System mode shows all (system controls the selection)

    if (!search.trim()) return modeFiltered
    const q = search.toLowerCase()
    return modeFiltered.filter(t => t.name.toLowerCase().includes(q))
  }, [allThemes, search, state.mode])

  // Group themes by category with Pinned section
  const sections = useMemo(() => {
    const groups: Array<{ label: string; themes: ThemeDefinition[] }> = []

    // Pinned section
    const pinned = filteredThemes.filter(t => state.overrides[t.id]?.pinned)
    if (pinned.length > 0) {
      groups.push({ label: 'Pinned', themes: pinned })
    }

    // Category sections
    for (const cat of CATEGORY_ORDER) {
      const themes = filteredThemes.filter(t => t.category === cat && t.builtIn)
      if (themes.length > 0) {
        groups.push({ label: CATEGORY_LABELS[cat], themes })
      }
    }

    // Custom section
    const custom = filteredThemes.filter(t => !t.builtIn)
    if (custom.length > 0 || !search.trim()) {
      groups.push({ label: 'Custom', themes: custom })
    }

    return groups
  }, [filteredThemes, state.overrides, search])

  const currentAccent = state.overrides[state.activeThemeId]?.accent
    ?? BUILT_IN_THEMES.find(t => t.id === state.activeThemeId)?.colors.accent
    ?? '#a78bfa'

  if (!open) return null

  const noResults = search.trim() && filteredThemes.length === 0

  const modal = (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal-backdrop)' as unknown as number,
        background: 'var(--overlay)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: closing
          ? 'themePickerFadeOut 150ms var(--ease-out) forwards'
          : 'themePickerFadeIn 200ms var(--ease-spring) forwards',
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose theme"
        style={{
          width: 'min(960px, 90vw)',
          maxHeight: 'min(80vh, 840px)',
          borderRadius: 'var(--radius-xl)',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-high)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          overflow: 'hidden',
          animation: closing
            ? 'themePickerScaleOut 150ms var(--ease-out) forwards'
            : 'themePickerScaleIn 200ms var(--ease-spring) forwards',
        }}
      >
        {/* Mode selector — sticky */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <ModeSelector currentMode={state.mode} onChange={handleModeChange} />

          {/* Search input */}
          <input
            ref={searchRef}
            type="text"
            placeholder="Search themes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search themes"
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-base)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {noResults ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-secondary)' }}>
              <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                No matching themes
              </h3>
              <p style={{ fontSize: 'var(--text-base)', margin: 0 }}>
                Try a different search term.
              </p>
            </div>
          ) : (
            sections.map(section => (
              <div key={section.label}>
                <h3 style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: '0 0 var(--space-2) 0',
                }}>
                  {section.label}
                </h3>
                <div
                  role="radiogroup"
                  aria-label={`${section.label} themes`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: 'var(--space-4)',
                  }}
                >
                  {section.themes.map(theme => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      isActive={state.activeThemeId === theme.id}
                      isPinned={state.overrides[theme.id]?.pinned}
                      isCustom={!theme.builtIn}
                      onClick={(e) => handleThemeClick(theme, e)}
                    />
                  ))}
                  {section.label === 'Custom' && section.themes.length === 0 && (
                    <div style={{
                      padding: 'var(--space-4)',
                      color: 'var(--text-secondary)',
                      fontSize: 'var(--text-sm)',
                      gridColumn: '1 / -1',
                    }}>
                      <p style={{ fontWeight: 500, margin: 0 }}>No custom themes</p>
                      <p style={{ margin: '4px 0 0 0' }}>Import a theme or save your current setup as a preset.</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Accent Picker */}
          {!noResults && (
            <AccentPicker
              color={currentAccent}
              onChange={setAccentOverride}
              label="Accent"
            />
          )}
        </div>

        {/* Live region for theme change announcements */}
        <div aria-live="polite" role="status" style={{ position: 'absolute', clip: 'rect(0 0 0 0)', height: 1, width: 1, margin: -1, overflow: 'hidden' }}>
          {announcement}
        </div>
      </div>

      <style>{`
        @keyframes themePickerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes themePickerFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes themePickerScaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes themePickerScaleOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.95); }
        }
      `}</style>
    </div>
  )

  return createPortal(modal, document.body)
}

// ---------------------------------------------------------------------------
// Mode Selector sub-component
// ---------------------------------------------------------------------------

const MODE_OPTIONS: Array<{ mode: 'dark' | 'light' | 'system'; label: string; Icon: typeof Moon }> = [
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'system', label: 'System', Icon: Laptop },
]

function ModeSelector({ currentMode, onChange }: { currentMode: string; onChange: (mode: 'dark' | 'light' | 'system') => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme mode"
      style={{
        display: 'flex',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-md, 10px)',
        padding: 2,
        gap: 2,
      }}
    >
      {MODE_OPTIONS.map(({ mode, label, Icon }) => {
        const active = currentMode === mode
        return (
          <button
            key={mode}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '8px 16px',
              border: 'none',
              borderRadius: 'var(--radius-md, 10px)',
              cursor: 'pointer',
              fontSize: 'var(--text-base)',
              fontWeight: active ? 600 : 400,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--text-on-accent, #fff)' : 'var(--text-secondary)',
              transition: 'background 150ms ease-out, color 150ms ease-out',
            }}
          >
            <Icon size={14} weight={active ? 'bold' : 'regular'} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
