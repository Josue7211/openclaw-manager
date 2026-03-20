import { useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { row, rowLast, sectionLabel } from './shared'

export default function SettingsData() {
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <div style={sectionLabel}>Data & Backup</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
        Export your local settings to a JSON file or import a previously exported backup.
      </p>

      <div style={row}>
        <div>
          <span>Export settings</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Download all local settings as a .json file</div>
        </div>
        <Button
          variant="primary"
          style={{ fontSize: '12px', padding: '8px 16px' }}
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
        </Button>
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
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} style={{ fontSize: '12px', padding: '8px 16px' }}>
            Import
          </Button>
        </div>
      </div>

      {importStatus && (
        <div style={{ marginTop: '12px', fontSize: '12px', fontFamily: 'monospace', color: importStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>
          {importStatus}
        </div>
      )}
    </div>
  )
}
