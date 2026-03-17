import { useState, useRef } from 'react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import Toggle from './Toggle'
import { row, rowLast, btnStyle, btnSecondary, sectionLabel } from './shared'

export default function SettingsPrivacy() {
  const [errorReporting, setErrorReporting] = useLocalStorageState('error-reporting', false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      {/* ── Privacy ─────────────────────────────────────────────── */}
      <div style={sectionLabel}>Privacy</div>
      <div style={row}>
        <div>
          <span>Anonymous crash reports</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', maxWidth: '340px', lineHeight: 1.5 }}>
            Send anonymized error reports to help improve Mission Control. No personal data, messages, or credentials are ever included.
          </div>
        </div>
        <Toggle on={errorReporting} onToggle={v => { setErrorReporting(v) }} label="Anonymous crash reports" />
      </div>
      <div style={row}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, padding: '4px 0' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>What is collected:</strong> error message, stack trace (truncated), app version, platform, page route, timestamp.
          <br />
          <strong style={{ color: 'var(--text-secondary)' }}>Never collected:</strong> message content, contact names, API keys, URLs, or IP addresses.
        </div>
      </div>

      {/* ── Data & Backup ───────────────────────────────────────── */}
      <div style={{ ...sectionLabel, marginTop: '24px' }}>Data & Backup</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
        Export your local settings to a JSON file or import a previously exported backup.
      </p>

      <div style={row}>
        <div>
          <span>Export settings</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Download all local settings as a .json file</div>
        </div>
        <button
          style={btnStyle}
          onClick={() => {
            const KNOWN_PREFIXES = [
              'dnd-enabled', 'system-notifs', 'in-app-notifs', 'notif-sound',
              'title-bar-visible', 'sidebar-header-visible', 'user-name', 'user-avatar',
              'app-version', 'keybindings', 'sidebar-collapsed', 'theme', 'enabled-modules',
              'error-reporting',
            ]
            const data: Record<string, string> = {}
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (!key) continue
              if (KNOWN_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix + '-'))) {
                data[key] = localStorage.getItem(key)!
              }
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `mission-control-settings-${new Date().toISOString().slice(0, 10)}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }}
        >
          Export
        </button>
      </div>

      <div style={rowLast}>
        <div>
          <span>Import settings</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Restore settings from a backup file (reloads page)</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              setImportStatus(null)
              const reader = new FileReader()
              reader.onload = () => {
                try {
                  const parsed = JSON.parse(reader.result as string)
                  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                    setImportStatus('Error: Invalid settings file format.')
                    return
                  }
                  const keys = Object.keys(parsed)
                  if (keys.length === 0) {
                    setImportStatus('Error: Settings file is empty.')
                    return
                  }
                  const KNOWN_PREFIXES = [
                    'dnd-enabled', 'system-notifs', 'in-app-notifs', 'notif-sound',
                    'title-bar-visible', 'sidebar-header-visible', 'user-name', 'user-avatar',
                    'app-version', 'keybindings', 'sidebar-collapsed', 'theme', 'enabled-modules',
                    'error-reporting',
                  ]
                  for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value === 'string' && KNOWN_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix + '-'))) {
                      localStorage.setItem(key, value)
                    }
                  }
                  window.location.reload()
                } catch {
                  setImportStatus('Error: Could not parse settings file.')
                }
              }
              reader.onerror = () => setImportStatus('Error: Failed to read file.')
              reader.readAsText(file)
              // Reset input so re-selecting same file triggers onChange
              e.target.value = ''
            }}
          />
          <button style={btnSecondary} onClick={() => fileInputRef.current?.click()}>
            Import
          </button>
        </div>
      </div>

      {importStatus && (
        <div style={{ marginTop: '12px', fontSize: '12px', fontFamily: 'monospace', color: importStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
          {importStatus}
        </div>
      )}
    </div>
  )
}
