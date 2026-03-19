/**
 * FontPicker — 4-slot font customization with system, bundled, and Google Font sources.
 *
 * Each slot (Body, Heading, Monospace, UI) has a custom dropdown showing
 * available fonts rendered in their own typeface. Includes a base font size
 * slider (80%-120%) and a global font override toggle.
 *
 * System fonts are enumerated via the list_system_fonts Tauri command.
 * In browser mode, system fonts show a placeholder message.
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { GOOGLE_FONTS, loadGoogleFont } from '@/lib/google-fonts'
import {
  useThemeState,
  setFontOverride,
  setFontScale,
  setGlobalFontOverride,
} from '@/lib/theme-store'
import { applyFonts, applyFontScale } from '@/lib/theme-engine'
import { sectionLabel, row } from '@/pages/settings/shared'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_SLOTS = [
  { key: 'body', label: 'Body' },
  { key: 'heading', label: 'Heading' },
  { key: 'mono', label: 'Monospace' },
  { key: 'ui', label: 'UI' },
] as const

type FontSlot = (typeof FONT_SLOTS)[number]['key']

/** Bundled fonts -- always available without network */
const BUNDLED_FONTS = [
  { family: 'Inter', category: 'sans-serif' as const },
  { family: 'JetBrains Mono', category: 'monospace' as const },
  { family: 'Fira Code', category: 'monospace' as const },
]

const PREVIEW_TEXT = 'The quick brown fox jumps over the lazy dog'

// ---------------------------------------------------------------------------
// FontSlotDropdown
// ---------------------------------------------------------------------------

interface FontSlotDropdownProps {
  slot: FontSlot
  label: string
  currentFont: string | undefined
  systemFonts: string[]
  systemFontsLoading: boolean
  isTauriAvailable: boolean
  onSelect: (slot: FontSlot, family: string) => void
}

const FontSlotDropdown = memo(function FontSlotDropdown({
  slot,
  label,
  currentFont,
  systemFonts,
  systemFontsLoading,
  isTauriAvailable,
  onSelect,
}: FontSlotDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const displayFont = currentFont || (slot === 'mono' ? 'JetBrains Mono' : 'Inter')

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const lowerSearch = search.toLowerCase()

  const filteredBundled = BUNDLED_FONTS.filter(f =>
    f.family.toLowerCase().includes(lowerSearch),
  )
  const filteredSystem = systemFonts.filter(f =>
    f.toLowerCase().includes(lowerSearch),
  )
  const filteredGoogle = GOOGLE_FONTS.filter(f =>
    f.family.toLowerCase().includes(lowerSearch),
  )

  function handleSelect(family: string, isGoogle: boolean) {
    if (isGoogle) loadGoogleFont(family)
    onSelect(slot, family)
    setOpen(false)
    setSearch('')
  }

  return (
    <div
      ref={containerRef}
      style={{ marginBottom: '16px' }}
    >
      <label
        htmlFor={`font-slot-${slot}`}
        style={{
          display: 'block',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: '6px',
        }}
      >
        {label}
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Dropdown trigger */}
        <button
          id={`font-slot-${slot}`}
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label} font`}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            minWidth: '200px',
            textAlign: 'left',
            fontFamily: displayFont,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{displayFont}</span>
          <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '8px' }}>
            {open ? '\u25B2' : '\u25BC'}
          </span>
        </button>

        {/* Preview text */}
        <span
          style={{
            fontSize: 'var(--text-base)',
            fontFamily: displayFont,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '300px',
          }}
        >
          {PREVIEW_TEXT}
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          aria-label={`${label} font options`}
          style={{
            position: 'absolute',
            zIndex: 'var(--z-modal)',
            background: 'var(--bg-popover)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            marginTop: '4px',
            maxHeight: '320px',
            overflowY: 'auto',
            width: '320px',
            boxShadow: 'var(--shadow-high)',
          }}
        >
          {/* Search */}
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fonts..."
              aria-label={`Search ${label.toLowerCase()} fonts`}
              autoFocus
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Bundled section */}
          {filteredBundled.length > 0 && (
            <div>
              <div style={sectionHeader}>Bundled</div>
              {filteredBundled.map(f => (
                <FontOption
                  key={`bundled-${f.family}`}
                  family={f.family}
                  active={displayFont === f.family}
                  onSelect={() => handleSelect(f.family, false)}
                />
              ))}
            </div>
          )}

          {/* System fonts section */}
          <div>
            <div style={sectionHeader}>System Fonts</div>
            {!isTauriAvailable ? (
              <div style={hintStyle}>
                System fonts available in desktop app
              </div>
            ) : systemFontsLoading ? (
              <div style={hintStyle}>
                Loading system fonts...
              </div>
            ) : filteredSystem.length === 0 ? (
              <div style={hintStyle}>
                {search ? 'No matching system fonts' : 'No system fonts found'}
              </div>
            ) : (
              filteredSystem.slice(0, 50).map(family => (
                <FontOption
                  key={`sys-${family}`}
                  family={family}
                  active={displayFont === family}
                  onSelect={() => handleSelect(family, false)}
                />
              ))
            )}
          </div>

          {/* Google Fonts section */}
          {filteredGoogle.length > 0 && (
            <div>
              <div style={sectionHeader}>Google Fonts</div>
              {filteredGoogle.slice(0, 30).map(f => (
                <FontOption
                  key={`google-${f.family}`}
                  family={f.family}
                  active={displayFont === f.family}
                  onSelect={() => handleSelect(f.family, true)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// FontOption (individual item in dropdown)
// ---------------------------------------------------------------------------

const FontOption = memo(function FontOption({
  family,
  active,
  onSelect,
}: {
  family: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      role="option"
      aria-selected={active}
      type="button"
      onClick={onSelect}
      className="hover-bg"
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: active ? 'var(--accent-a10)' : 'transparent',
        border: 'none',
        padding: '6px 12px',
        fontSize: '13px',
        fontFamily: family,
        color: active ? 'var(--accent)' : 'var(--text-primary)',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {family}
    </button>
  )
})

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const sectionHeader: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '8px 12px 4px',
}

const hintStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  padding: '6px 12px',
}

// ---------------------------------------------------------------------------
// FontPicker (main export)
// ---------------------------------------------------------------------------

export default function FontPicker() {
  const state = useThemeState()
  const overrides = state.overrides[state.activeThemeId]
  const currentFonts = overrides?.fonts ?? {}
  const currentScale = overrides?.fontScale ?? 1.0

  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [systemFontsLoading, setSystemFontsLoading] = useState(false)
  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

  // Load system fonts via Tauri command
  useEffect(() => {
    if (!isTauri) return
    setSystemFontsLoading(true)
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<string[]>('list_system_fonts'))
      .then(fonts => {
        setSystemFonts(fonts)
        setSystemFontsLoading(false)
      })
      .catch(() => {
        setSystemFontsLoading(false)
      })
  }, [isTauri])

  const handleFontSelect = useCallback((slot: FontSlot, family: string) => {
    setFontOverride(slot, family)
    // Apply immediately for live preview
    const updatedFonts = { ...currentFonts, [slot]: family }
    applyFonts(updatedFonts, state.globalFontOverride)
  }, [currentFonts, state.globalFontOverride])

  const handleScaleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10) / 100
    setFontScale(val)
    applyFontScale(val)
  }, [])

  const handleGlobalOverride = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setGlobalFontOverride(e.target.checked)
  }, [])

  return (
    <div>
      <div style={sectionLabel}>Fonts</div>

      {FONT_SLOTS.map(({ key, label }) => (
        <FontSlotDropdown
          key={key}
          slot={key}
          label={label}
          currentFont={currentFonts[key]}
          systemFonts={systemFonts}
          systemFontsLoading={systemFontsLoading}
          isTauriAvailable={isTauri}
          onSelect={handleFontSelect}
        />
      ))}

      {/* Base font size slider */}
      <div style={{ ...row, flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
        <label
          htmlFor="font-size-slider"
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          Base Size
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
          <input
            id="font-size-slider"
            type="range"
            min={80}
            max={120}
            step={5}
            value={Math.round(currentScale * 100)}
            onChange={handleScaleChange}
            role="slider"
            aria-valuemin={80}
            aria-valuemax={120}
            aria-valuenow={Math.round(currentScale * 100)}
            aria-label="Base font size"
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              fontFamily: 'monospace',
              minWidth: '40px',
              textAlign: 'right',
            }}
          >
            {Math.round(currentScale * 100)}%
          </span>
        </div>
      </div>

      {/* Global font override toggle */}
      <div style={{ ...row, borderBottom: 'none', paddingTop: '12px' }}>
        <label
          htmlFor="font-global-override"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <input
            id="font-global-override"
            type="checkbox"
            checked={state.globalFontOverride ?? false}
            onChange={handleGlobalOverride}
            style={{ accentColor: 'var(--accent)' }}
          />
          Keep my fonts when switching themes
        </label>
      </div>
    </div>
  )
}
