import { useState, useRef } from 'react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import Toggle from './Toggle'
import { Button } from '@/components/ui/Button'
import { row, rowLast, sectionLabel } from './shared'
import { api, API_BASE, getApiKey } from '@/lib/api'
import { Database, HardDrive, NotePencil } from '@phosphor-icons/react'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function SettingsPrivacy() {
  const [errorReporting, setErrorReporting] = useLocalStorageState('error-reporting', false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportingSupabase, setExportingSupabase] = useState(false)
  const [exportingSqlite, setExportingSqlite] = useState(false)
  const [exportingNotes, setExportingNotes] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  return (
    <div>
      {/* ── Privacy ─────────────────────────────────────────────── */}
      <div style={sectionLabel}>Privacy</div>
      <div style={row}>
        <div>
          <span>Anonymous crash reports</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', maxWidth: '340px', lineHeight: 1.5 }}>
            Send anonymized error reports to help improve OpenClaw Manager. No personal data, messages, or credentials are ever included.
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

      {/* -- Data Export ---------------------------------------- */}
      <div style={{ ...sectionLabel, marginTop: '32px' }}>Data Export</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
        Export your data in portable formats. Supabase and Notes exports are scoped to your account.
      </p>

      <div style={row}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Database size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div>
            <span>Export all data</span>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Download all Supabase tables (todos, missions, ideas, etc.) as a JSON file</div>
          </div>
        </div>
        <Button
          variant="primary"
          style={{ fontSize: '12px', padding: '8px 16px' }}
          disabled={exportingSupabase}
          onClick={async () => {
            setExportError(null)
            setExportingSupabase(true)
            try {
              const result = await api.get<{ data: unknown }>('/api/export/supabase')
              const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' })
              downloadBlob(blob, `mission-control-data-${new Date().toISOString().slice(0, 10)}.json`)
            } catch (err) {
              setExportError('Failed to export Supabase data. ' + (err instanceof Error ? err.message : ''))
            } finally {
              setExportingSupabase(false)
            }
          }}
        >
          {exportingSupabase ? 'Exporting...' : 'Export JSON'}
        </Button>
      </div>

      <div style={row}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HardDrive size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div>
            <span>Export local database</span>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Download the local SQLite cache as a backup file</div>
          </div>
        </div>
        <Button
          variant="secondary"
          style={{ fontSize: '12px', padding: '8px 16px' }}
          disabled={exportingSqlite}
          onClick={async () => {
            setExportError(null)
            setExportingSqlite(true)
            try {
              const headers: Record<string, string> = {}
              const key = getApiKey()
              if (key) headers['X-API-Key'] = key
              const resp = await fetch(`${API_BASE}/api/export/sqlite`, { headers })
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
              const blob = await resp.blob()
              downloadBlob(blob, `mission-control-backup-${new Date().toISOString().slice(0, 10)}.sqlite`)
            } catch (err) {
              setExportError('Failed to export SQLite backup. ' + (err instanceof Error ? err.message : ''))
            } finally {
              setExportingSqlite(false)
            }
          }}
        >
          {exportingSqlite ? 'Exporting...' : 'Export SQLite'}
        </Button>
      </div>

      <div style={rowLast}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <NotePencil size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div>
            <span>Export notes</span>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Download all vault notes as individual markdown files (bundled in a .json archive)</div>
          </div>
        </div>
        <Button
          variant="secondary"
          style={{ fontSize: '12px', padding: '8px 16px' }}
          disabled={exportingNotes}
          onClick={async () => {
            setExportError(null)
            setExportingNotes(true)
            try {
              const result = await api.get<{ data: { notes: Array<{ id: string; content: string }> } }>('/api/export/notes')
              if (result.data.notes.length === 0) {
                setExportError('No notes found to export.')
                return
              }
              const archive = {
                exported_at: new Date().toISOString(),
                notes: result.data.notes.map(n => ({
                  filename: n.id.endsWith('.md') ? n.id : n.id + '.md',
                  content: n.content,
                })),
              }
              const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' })
              downloadBlob(blob, `mission-control-notes-${new Date().toISOString().slice(0, 10)}.json`)
            } catch (err) {
              setExportError('Failed to export notes. ' + (err instanceof Error ? err.message : ''))
            } finally {
              setExportingNotes(false)
            }
          }}
        >
          {exportingNotes ? 'Exporting...' : 'Export Notes'}
        </Button>
      </div>

      {exportError && (
        <div role="alert" style={{ marginTop: '12px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--red)' }}>
          {exportError}
        </div>
      )}
    </div>
  )
}
