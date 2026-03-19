/**
 * BrandingSettings — customize app title, logo, sidebar header text, and login tagline.
 *
 * All fields auto-persist to localStorage. App title also updates document.title.
 * Sidebar header text uses setSidebarTitleText from sidebar-settings.ts.
 * Each field has a clear (X) button to reset to default.
 */

import { useState, useCallback, useRef, memo } from 'react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { setSidebarTitleText, getSidebarTitleText } from '@/lib/sidebar-settings'
import { sectionLabel, row, inputStyle } from '@/pages/settings/shared'
import { X } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_APP_TITLE = 'OpenClaw Manager'
const DEFAULT_SIDEBAR_TEXT = 'OPENCLAW'
const DEFAULT_TAGLINE = 'Your personal command center'
const MAX_LOGO_SIZE = 512 * 1024 // 512KB

const STORAGE_KEYS = {
  appTitle: 'branding-app-title',
  logo: 'branding-logo',
  tagline: 'branding-tagline',
} as const

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const fieldRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: '13px',
  color: 'var(--text-primary)',
  gap: '12px',
}

const fieldInput: React.CSSProperties = {
  ...inputStyle,
  width: '220px',
}

const clearBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  color: 'var(--text-muted)',
}

// ---------------------------------------------------------------------------
// BrandingSettings
// ---------------------------------------------------------------------------

export default function BrandingSettings() {
  const [appTitle, setAppTitle] = useLocalStorageState(STORAGE_KEYS.appTitle, '')
  const [logo, setLogo] = useLocalStorageState(STORAGE_KEYS.logo, '')
  const [tagline, setTagline] = useLocalStorageState(STORAGE_KEYS.tagline, '')
  const [sidebarText, setSidebarText] = useState(() => getSidebarTitleText())
  const [logoError, setLogoError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── App title ──
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setAppTitle(val)
    document.title = val || DEFAULT_APP_TITLE
  }, [setAppTitle])

  const clearTitle = useCallback(() => {
    setAppTitle('')
    document.title = DEFAULT_APP_TITLE
  }, [setAppTitle])

  // ── Sidebar header text ──
  const handleSidebarTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSidebarText(val)
    setSidebarTitleText(val)
  }, [])

  const clearSidebarText = useCallback(() => {
    setSidebarText(DEFAULT_SIDEBAR_TEXT)
    setSidebarTitleText(DEFAULT_SIDEBAR_TEXT)
  }, [])

  // ── Logo ──
  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError('')
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_LOGO_SIZE) {
      setLogoError('Logo must be under 512KB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogo(result)
    }
    reader.onerror = () => {
      setLogoError('Could not read the file')
    }
    reader.readAsDataURL(file)

    // Reset file input so the same file can be re-selected
    e.target.value = ''
  }, [setLogo])

  const clearLogo = useCallback(() => {
    setLogo('')
    setLogoError('')
  }, [setLogo])

  // ── Tagline ──
  const handleTaglineChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTagline(e.target.value)
  }, [setTagline])

  const clearTagline = useCallback(() => {
    setTagline('')
  }, [setTagline])

  return (
    <div>
      <div style={sectionLabel}>Branding</div>

      {/* App Title */}
      <div style={fieldRow}>
        <label htmlFor="branding-title" style={{ whiteSpace: 'nowrap' }}>
          App Title
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            id="branding-title"
            type="text"
            value={appTitle}
            onChange={handleTitleChange}
            placeholder={DEFAULT_APP_TITLE}
            maxLength={40}
            style={fieldInput}
          />
          {appTitle && (
            <button
              type="button"
              onClick={clearTitle}
              aria-label="Clear app title"
              style={clearBtn}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* App Logo */}
      <div style={fieldRow}>
        <label htmlFor="branding-logo" style={{ whiteSpace: 'nowrap' }}>
          App Logo
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {logo && (
            <img
              src={logo}
              alt="App logo preview"
              style={{
                height: '32px',
                width: 'auto',
                borderRadius: '4px',
                objectFit: 'contain',
              }}
            />
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload app logo"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {logo ? 'Change' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            id="branding-logo"
            type="file"
            accept="image/png,image/svg+xml,image/jpeg"
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
          {logo && (
            <button
              type="button"
              onClick={clearLogo}
              aria-label="Clear app logo"
              style={clearBtn}
            >
              <X size={14} />
            </button>
          )}
          {logoError && (
            <span
              role="alert"
              style={{ fontSize: '11px', color: 'var(--red-500)' }}
            >
              {logoError}
            </span>
          )}
        </div>
      </div>

      {/* Sidebar Header Text */}
      <div style={fieldRow}>
        <label htmlFor="branding-sidebar" style={{ whiteSpace: 'nowrap' }}>
          Sidebar Title
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            id="branding-sidebar"
            type="text"
            value={sidebarText}
            onChange={handleSidebarTextChange}
            placeholder={DEFAULT_SIDEBAR_TEXT}
            maxLength={20}
            style={fieldInput}
          />
          {sidebarText !== DEFAULT_SIDEBAR_TEXT && (
            <button
              type="button"
              onClick={clearSidebarText}
              aria-label="Clear sidebar title"
              style={clearBtn}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Login Page Tagline */}
      <div style={{ ...fieldRow, borderBottom: 'none' }}>
        <label htmlFor="branding-tagline" style={{ whiteSpace: 'nowrap' }}>
          Login Tagline
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            id="branding-tagline"
            type="text"
            value={tagline}
            onChange={handleTaglineChange}
            placeholder={DEFAULT_TAGLINE}
            maxLength={80}
            style={{ ...fieldInput, width: '280px' }}
          />
          {tagline && (
            <button
              type="button"
              onClick={clearTagline}
              aria-label="Clear login tagline"
              style={clearBtn}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
