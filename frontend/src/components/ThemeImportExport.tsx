/**
 * ThemeImportExport -- import/export themes via JSON file, paste, drag-drop, and share codes.
 *
 * Import supports: OS file dialog, paste (JSON or share code), drag-and-drop.
 * Export supports: JSON file download, clipboard share code copy.
 * Also includes "Save as Custom Preset" flow.
 */

import { useState, useRef, useCallback, memo } from 'react'
import {
  validateThemeImport,
  parseImportInput,
  downloadThemeJson,
  encodeShareCode,
} from '@/lib/theme-validation'
import { getThemeById, BUILT_IN_THEMES } from '@/lib/theme-definitions'
import type { ThemeDefinition } from '@/lib/theme-definitions'
import {
  useThemeState,
  addCustomTheme,
  setActiveTheme,
} from '@/lib/theme-store'
import { sectionLabel, row, btnStyle, btnSecondary } from '@/pages/settings/shared'
import { DownloadSimple, UploadSimple, Copy, FloppyDisk, Check } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// ThemeImportExport
// ---------------------------------------------------------------------------

const ThemeImportExport = memo(function ThemeImportExport() {
  const state = useThemeState()
  const overrides = state.overrides[state.activeThemeId]

  // Import state
  const [pasteValue, setPasteValue] = useState('')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Export state
  const [includeArtwork, setIncludeArtwork] = useState(true)
  const [shareCode, setShareCode] = useState('')
  const [copied, setCopied] = useState(false)

  // Save as preset state
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [presetName, setPresetName] = useState('')

  // Resolve the current theme definition
  const currentTheme: ThemeDefinition | undefined =
    getThemeById(state.activeThemeId) ??
    state.customThemes.find(t => t.id === state.activeThemeId)

  // ---------------------------------------------------------------------------
  // Import helpers
  // ---------------------------------------------------------------------------

  const handleImportTheme = useCallback((data: { theme: ThemeDefinition; overrides?: unknown }) => {
    const validation = validateThemeImport(data.theme)
    if (!validation.valid) {
      setImportError(validation.error ?? 'Invalid theme file')
      setImportSuccess('')
      return
    }

    // Ensure imported theme is not built-in
    const imported = { ...data.theme, builtIn: false }
    if (!imported.id) imported.id = `custom-${crypto.randomUUID()}`

    addCustomTheme(imported)
    setActiveTheme(imported.id)
    setImportError('')
    setImportSuccess('Theme imported successfully')
    setPasteValue('')
    setTimeout(() => setImportSuccess(''), 3000)
  }, [])

  const handleFileImport = useCallback((file: File) => {
    setImportError('')
    setImportSuccess('')
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const parsed = parseImportInput(text)
      if (!parsed) {
        setImportError('Could not parse the theme file. Please check the format.')
        return
      }
      handleImportTheme(parsed)
    }
    reader.onerror = () => {
      setImportError('Could not read the file')
    }
    reader.readAsText(file)
  }, [handleImportTheme])

  const handlePasteImport = useCallback(() => {
    setImportError('')
    setImportSuccess('')
    const parsed = parseImportInput(pasteValue)
    if (!parsed) {
      setImportError('Could not parse theme data. Paste valid JSON or a share code starting with ocm-theme:v1:')
      return
    }
    handleImportTheme(parsed)
  }, [pasteValue, handleImportTheme])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileImport(file)
    e.target.value = ''
  }, [handleFileImport])

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.json')) {
      handleFileImport(file)
    } else {
      setImportError('Please drop a .json theme file')
    }
  }, [handleFileImport])

  // ---------------------------------------------------------------------------
  // Export helpers
  // ---------------------------------------------------------------------------

  const handleExport = useCallback(() => {
    if (!currentTheme) return
    downloadThemeJson(currentTheme, overrides, includeArtwork)
  }, [currentTheme, overrides, includeArtwork])

  const handleCopyShareCode = useCallback(() => {
    if (!currentTheme) return
    const code = encodeShareCode(currentTheme, overrides)
    setShareCode(code)
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [currentTheme, overrides])

  // ---------------------------------------------------------------------------
  // Save as custom preset
  // ---------------------------------------------------------------------------

  const handleSavePreset = useCallback(() => {
    if (!currentTheme || !presetName.trim()) return

    const allThemes = [...BUILT_IN_THEMES, ...state.customThemes]
    const base = allThemes.find(t => t.id === state.activeThemeId)
    if (!base) return

    // Merge base theme colors with overrides
    const mergedColors = { ...base.colors }
    if (overrides?.accent) mergedColors['accent'] = overrides.accent
    if (overrides?.secondary) mergedColors['accent-dim'] = overrides.secondary
    if (overrides?.glow) mergedColors['glow-top-rgb'] = overrides.glow
    if (overrides?.logo) {
      // Logo is stored as an override but not as a CSS property directly
    }

    const newTheme: ThemeDefinition = {
      id: `custom-${crypto.randomUUID()}`,
      name: presetName.trim(),
      category: base.category,
      builtIn: false,
      colors: mergedColors,
      fonts: overrides?.fonts ?? base.fonts,
      fontScale: overrides?.fontScale ?? base.fontScale,
    }

    addCustomTheme(newTheme)
    setActiveTheme(newTheme.id)
    setShowSavePreset(false)
    setPresetName('')
  }, [currentTheme, presetName, state, overrides])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <div style={sectionLabel}>Import / Export</div>

      {/* Import section */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          padding: '12px 0',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <UploadSimple size={14} />
            Import Theme
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            aria-label="Import theme file"
          />
        </div>

        {/* Paste area */}
        <div
          style={{
            border: dragOver ? '2px dashed var(--accent)' : '2px dashed var(--border)',
            borderRadius: '8px',
            padding: '4px',
            transition: 'border-color 0.15s ease',
            background: dragOver ? 'var(--accent-a10, rgba(167, 139, 250, 0.1))' : 'transparent',
          }}
        >
          <textarea
            value={pasteValue}
            onChange={e => { setPasteValue(e.target.value); setImportError(''); setImportSuccess('') }}
            placeholder="Paste theme JSON or share code..."
            aria-label="Paste theme JSON or share code"
            rows={4}
            style={{
              width: '100%',
              background: 'var(--bg-card-solid)',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono, monospace)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {pasteValue.trim() && (
          <button
            onClick={handlePasteImport}
            style={{ ...btnStyle, marginTop: '8px', fontSize: '12px' }}
          >
            Import
          </button>
        )}

        {/* Error display */}
        {importError && (
          <div
            aria-live="assertive"
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--red)',
            }}
          >
            {importError}
          </div>
        )}

        {/* Success display */}
        {importSuccess && (
          <div
            aria-live="polite"
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--secondary)',
            }}
          >
            {importSuccess}
          </div>
        )}

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Drag and drop a .json theme file above, or use the Import button.
        </div>
      </div>

      {/* Export section */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <button
            onClick={handleExport}
            disabled={!currentTheme}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <DownloadSimple size={14} />
            Export Theme
          </button>

          <button
            onClick={handleCopyShareCode}
            disabled={!currentTheme}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Share Code'}
          </button>
        </div>

        {/* Include artwork checkbox */}
        <label
          htmlFor="include-artwork"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            marginBottom: '8px',
          }}
        >
          <input
            id="include-artwork"
            type="checkbox"
            checked={includeArtwork}
            onChange={e => setIncludeArtwork(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          Include artwork image
        </label>

        {/* Share code display */}
        {shareCode && (
          <input
            type="text"
            readOnly
            value={shareCode}
            aria-label="Theme share code"
            onFocus={e => e.target.select()}
            style={{
              width: '100%',
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '8px 12px',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      {/* Save as Custom Preset */}
      <div style={{ ...row, borderBottom: 'none', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
        {!showSavePreset ? (
          <button
            onClick={() => setShowSavePreset(true)}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FloppyDisk size={14} />
            Save as Custom Preset
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <input
              autoFocus
              type="text"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              placeholder="My Custom Theme"
              aria-label="Custom preset name"
              onKeyDown={e => {
                if (e.key === 'Enter' && presetName.trim()) handleSavePreset()
                if (e.key === 'Escape') { setShowSavePreset(false); setPresetName('') }
              }}
              style={{
                flex: 1,
                background: 'var(--bg-card-solid)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              style={{
                ...btnStyle,
                opacity: presetName.trim() ? 1 : 0.5,
                cursor: presetName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setShowSavePreset(false); setPresetName('') }}
              style={btnSecondary}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

export default ThemeImportExport
