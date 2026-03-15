


import { Settings, Bell, Shield, LogOut, Palette, User, Server, Cpu, Zap, ChevronRight, ArrowLeft, Keyboard, Database, Sun, Moon, Laptop, Blocks, Plug, AlertTriangle, Download, EyeOff, FolderOpen, FileText, HeartPulse, Wifi, Info, RefreshCw, Clock, HardDrive, Layers, GripVertical, Plus, Trash2, Check, X, Pencil, ArrowUp, ArrowDown } from 'lucide-react'
import { useState, useEffect, useSyncExternalStore, memo, useRef, useCallback } from 'react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { getKeybindings, subscribeKeybindings, updateKeybinding, resetKeybindings, formatKey, getModifierKey, setModifierKey, getModifierList, addModifier, removeModifier, reorderModifiers, getBindingMod, keyToModifier, modLabel, type ModifierKey } from '@/lib/keybindings'
import { getSidebarHeaderVisible, setSidebarHeaderVisible, getSidebarDefaultWidth, setSidebarDefaultWidth, getSidebarTitleLayout, setSidebarTitleLayout, getSidebarTitleText, setSidebarTitleText, getSidebarSearchVisible, setSidebarSearchVisible, getSidebarLogoVisible, setSidebarLogoVisible, getSidebarTitleSize, setSidebarTitleSize, subscribeSidebarSettings } from '@/lib/sidebar-settings'
import { setTitleBarVisible, setTitleBarAutoHide, getTitleBarVisible, getTitleBarAutoHide, subscribeTitleBarSettings } from '@/lib/titlebar-settings'
import { ACCENT_PRESETS, DEFAULT_ACCENT, DEFAULT_GLOW, DEFAULT_SECONDARY, DEFAULT_LOGO, applyAccentColor, applyGlowColor, applySecondaryColor, applyLogoColor } from '@/lib/themes'
import { APP_MODULES, getEnabledModules, setEnabledModules, subscribeModules } from '@/lib/modules'
import {
  getSidebarConfig, setSidebarConfig, resetSidebarConfig, subscribeSidebarConfig,
  renameItem, renameCategory, moveItem, createCustomModule, deleteCustomModule,
  softDeleteItem, restoreItem, permanentlyDelete, emptyRecycleBin,
} from '@/lib/sidebar-config'
import { navItemsByHref } from '@/lib/nav-items'
import { ContextMenu, type ContextMenuState } from '@/components/ContextMenu'
import { ResizablePanel, type PanelRect } from '@/components/ResizablePanel'
import OnboardingWelcome, { resetSetupWizard } from '@/components/OnboardingWelcome'

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: '13px',
  color: 'var(--text-primary)',
}

const rowLast: React.CSSProperties = { ...row, borderBottom: 'none' }

const val: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'monospace',
  fontSize: '12px',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '12px',
  fontFamily: 'monospace',
  color: 'var(--text-primary)',
  width: '280px',
  outline: 'none',
}

const btnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: '8px 16px',
  fontSize: '12px',
  color: 'var(--text-on-accent)',
  cursor: 'pointer',
  fontWeight: 600,
}

const btnSecondary: React.CSSProperties = {
  ...btnStyle,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontWeight: 500,
}

const Toggle = memo(function Toggle({ on, onToggle, label }: { on: boolean; onToggle: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onToggle(!on)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
        background: on ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
        position: 'relative', transition: 'background 0.25s var(--ease-spring)', padding: 0, flexShrink: 0,
        boxShadow: on ? '0 0 8px rgba(167,139,250,0.15)' : 'none',
      }}
      onMouseDown={e => {
        const knob = e.currentTarget.querySelector('span') as HTMLElement
        if (knob) knob.style.transform = 'scale(0.9)'
      }}
      onMouseUp={e => {
        const knob = e.currentTarget.querySelector('span') as HTMLElement
        if (knob) knob.style.transform = 'scale(1)'
      }}
      onMouseLeave={e => {
        const knob = e.currentTarget.querySelector('span') as HTMLElement
        if (knob) knob.style.transform = 'scale(1)'
      }}
    >
      <span style={{
        position: 'absolute', top: '2px',
        left: on ? '22px' : '2px',
        width: '20px', height: '20px', borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'left 0.25s var(--ease-spring), transform 0.2s var(--ease-spring)',
      }} />
    </button>
  )
})

const sectionLabel: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '16px',
  marginTop: '8px',
}

interface Pref {
  key: string
  value: string
}

type SettingsSection = 'agent' | 'gateway' | 'app' | 'user' | 'connections' | 'display' | 'keybindings' | 'modules' | 'notifications' | 'privacy' | 'data' | 'status'

const SECTIONS: { key: SettingsSection; label: string; icon: React.ElementType; group: string }[] = [
  { key: 'agent', label: 'Agent', icon: Zap, group: 'General' },
  { key: 'gateway', label: 'Gateway', icon: Server, group: 'General' },
  { key: 'app', label: 'Mission Control', icon: Cpu, group: 'General' },
  { key: 'user', label: 'User', icon: User, group: 'General' },
  { key: 'connections', label: 'Connections', icon: Plug, group: 'General' },
  { key: 'display', label: 'Personalization', icon: Palette, group: 'App Settings' },
  { key: 'keybindings', label: 'Keybinds', icon: Keyboard, group: 'App Settings' },
  { key: 'modules', label: 'Sidebar', icon: Blocks, group: 'App Settings' },
  { key: 'notifications', label: 'Notifications', icon: Bell, group: 'App Settings' },
  { key: 'privacy', label: 'Privacy', icon: EyeOff, group: 'App Settings' },
  { key: 'data', label: 'Data & Backup', icon: Database, group: 'App Settings' },
  { key: 'status', label: 'System Status', icon: HeartPulse, group: 'App Settings' },
]

const SECTION_GROUPS = [...new Set(SECTIONS.map(s => s.group))]

// ── Status section types & helpers ──────────────────────────────────────────

interface ServiceStatus {
  status: string
  latency_ms?: number
  error?: string
  peer_hostname?: string
  peer_verified?: boolean
}

interface HealthData {
  version: string
  uptime_seconds: number
  platform: string
  hostname: string
  sqlite_cache_entries: number
  sqlite_db_size_bytes: number
  services: {
    bluebubbles: ServiceStatus
    openclaw: ServiceStatus
    supabase: ServiceStatus
  }
}

interface TailscalePeer {
  ip: string
  hostname: string
  online: boolean
}

interface TailscaleData {
  peers: TailscalePeer[]
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function svcStatusColor(status: string): string {
  switch (status) {
    case 'ok': return '#22c55e'
    case 'error': case 'degraded': return '#eab308'
    case 'unreachable': return '#ef4444'
    case 'not_configured': return 'var(--text-muted)'
    default: return 'var(--text-muted)'
  }
}

function svcStatusLabel(status: string): string {
  switch (status) {
    case 'ok': return 'Connected'
    case 'error': return 'Error'
    case 'unreachable': return 'Unreachable'
    case 'not_configured': return 'Not Configured'
    default: return status
  }
}

const statusCard: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px',
  backdropFilter: 'blur(12px)',
}

const statusSectionTitle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '16px',
}

const statusRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: '13px',
  color: 'var(--text-primary)',
}

const statusRowLast: React.CSSProperties = { ...statusRow, borderBottom: 'none' }

const statusVal: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'monospace',
  fontSize: '12px',
}

const dotStyle = (online: boolean): React.CSSProperties => ({
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: online ? '#22c55e' : '#ef4444',
  boxShadow: online ? '0 0 6px rgba(34,197,94,0.4)' : '0 0 6px rgba(239,68,68,0.4)',
  flexShrink: 0,
})

function StatusStatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '28px',
        fontWeight: 700,
        fontFamily: 'monospace',
        color: accent ?? 'var(--text-primary)',
        lineHeight: 1.2,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--text-muted)',
        marginTop: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
    </div>
  )
}

function StatusLoadingSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            height: '38px',
            borderBottom: i < rows - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 0',
          }}
        >
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--bg-elevated)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <div style={{
            height: '12px',
            width: `${40 + Math.random() * 30}%`,
            background: 'var(--bg-elevated)',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
      ))}
    </>
  )
}

/** Mission Control app settings section with logging info */
const AppSection = memo(function AppSection() {
  const [logDir, setLogDir] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string>('get_log_dir').then(setLogDir).catch(() => {})
    })
  }, [])

  const openLogsFolder = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__) return
    setOpening(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_log_dir')
    } catch (e) {
      console.error('Failed to open logs folder:', e)
    } finally {
      setOpening(false)
    }
  }, [])

  return (
    <div>
      <div style={sectionLabel}>Mission Control</div>
      <div style={row}><span>Host</span><span style={val}>{window.location.host}</span></div>
      <div style={row}><span>Poll interval</span><span style={val}>2s</span></div>
      <div style={row}><span>Session file</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px' }}>~/.openclaw/agents/main/sessions/</span></div>

      <div style={{ ...sectionLabel, marginTop: '24px' }}>Logging</div>
      <div style={row}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={14} style={{ color: 'var(--text-muted)' }} />
            <span>Log files</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Daily rotation, last 7 days kept
          </span>
        </div>
        <span style={{ ...val, fontSize: '11px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={logDir ?? undefined}>
          {logDir ?? (window.__TAURI_INTERNALS__ ? 'Loading...' : 'Not available (browser mode)')}
        </span>
      </div>
      <div style={row}>
        <span>Open logs folder</span>
        <button
          onClick={openLogsFolder}
          disabled={!window.__TAURI_INTERNALS__ || opening}
          style={{
            ...btnSecondary,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            ...((!window.__TAURI_INTERNALS__) ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
          }}
          title={window.__TAURI_INTERNALS__ ? 'Open log directory in file manager' : 'Only available in desktop app'}
        >
          <FolderOpen size={14} />
          {opening ? 'Opening...' : 'Open folder'}
        </button>
      </div>

      <div style={{ ...sectionLabel, marginTop: '24px' }}>Updates</div>
      <div style={rowLast}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>Check for updates</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Auto-updater not yet configured. See README for setup instructions.
          </span>
        </div>
        <button
          style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.5, cursor: 'not-allowed' }}
          disabled
          title="Enable tauri-plugin-updater to use this feature"
        >
          <Download size={14} />
          Check for updates
        </button>
      </div>
    </div>
  )
})

/** System Status section — services, tailscale, sqlite, app info, react query cache */
const StatusSection = memo(function StatusSection() {
  const queryClient = useQueryClient()

  const { data: health, isLoading: healthLoading, dataUpdatedAt: healthUpdatedAt } = useQuery<HealthData>({
    queryKey: queryKeys.health,
    queryFn: () => api.get('/api/status/health'),
    refetchInterval: 10_000,
    staleTime: 8_000,
  })

  const { data: tailscale, isLoading: tsLoading } = useQuery<TailscaleData>({
    queryKey: queryKeys.tailscalePeers,
    queryFn: () => api.get('/api/status/tailscale'),
    refetchInterval: 10_000,
    staleTime: 8_000,
  })

  const queryCache = queryClient.getQueryCache()
  const allQueries = queryCache.getAll()
  const staleQueries = allQueries.filter(q => q.isStale())

  const lastRefresh = healthUpdatedAt
    ? new Date(healthUpdatedAt).toLocaleTimeString()
    : '--'

  const services = health?.services
  const serviceEntries: { key: string; label: string; data: ServiceStatus | undefined }[] = [
    { key: 'bluebubbles', label: 'BlueBubbles', data: services?.bluebubbles },
    { key: 'openclaw', label: 'OpenClaw', data: services?.openclaw },
    { key: 'supabase', label: 'Supabase', data: services?.supabase },
  ]

  const peers = tailscale?.peers ?? []
  const uniquePeers = peers.reduce<TailscalePeer[]>((acc, p) => {
    if (!acc.find(x => x.hostname === p.hostname)) acc.push(p)
    return acc
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            Last refresh: {lastRefresh}
          </span>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto-refresh 10s</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        {/* Services */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Server size={14} />
            Services
          </div>
          {healthLoading ? (
            <StatusLoadingSkeleton rows={3} />
          ) : (
            serviceEntries.map((svc, i) => {
              const s = svc.data
              const isLast = i === serviceEntries.length - 1
              return (
                <div key={svc.key} style={isLast ? statusRowLast : statusRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                      background: svcStatusColor(s?.status ?? 'unknown'),
                      boxShadow: s?.status === 'ok'
                        ? `0 0 6px ${svcStatusColor('ok')}60`
                        : s?.status === 'unreachable'
                          ? `0 0 6px ${svcStatusColor('unreachable')}60`
                          : 'none',
                    }} />
                    <span style={{ fontWeight: 500 }}>{svc.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {s?.latency_ms !== undefined && (
                      <span style={{ ...statusVal, fontSize: '11px', color: 'var(--text-muted)' }}>
                        {s.latency_ms}ms
                      </span>
                    )}
                    <span style={{
                      fontSize: '11px', fontWeight: 500,
                      color: svcStatusColor(s?.status ?? 'unknown'),
                    }}>
                      {svcStatusLabel(s?.status ?? 'unknown')}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Tailscale Peers */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Wifi size={14} />
            Tailscale Peers
          </div>
          {tsLoading ? (
            <StatusLoadingSkeleton rows={3} />
          ) : uniquePeers.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
              No peers found (tailscale may not be installed)
            </div>
          ) : (
            uniquePeers.map((peer, i) => {
              const isLast = i === uniquePeers.length - 1
              return (
                <div key={peer.hostname + peer.ip} style={isLast ? statusRowLast : statusRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={dotStyle(peer.online)} />
                    <span style={{ fontWeight: 500 }}>{peer.hostname}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ ...statusVal, fontSize: '11px' }}>{peer.ip}</span>
                    <span style={{
                      fontSize: '11px', fontWeight: 500,
                      color: peer.online ? '#22c55e' : '#ef4444',
                    }}>
                      {peer.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* SQLite Cache */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Database size={14} />
            SQLite Cache
          </div>
          {healthLoading ? (
            <StatusLoadingSkeleton rows={2} />
          ) : (
            <>
              <div style={statusRow}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={14} style={{ color: 'var(--text-muted)' }} />
                  Cached Entries
                </span>
                <span style={statusVal}>{health?.sqlite_cache_entries ?? '--'}</span>
              </div>
              <div style={statusRowLast}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HardDrive size={14} style={{ color: 'var(--text-muted)' }} />
                  Database Size
                </span>
                <span style={statusVal}>
                  {health ? formatBytes(health.sqlite_db_size_bytes) : '--'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* App Info */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Info size={14} />
            App Info
          </div>
          {healthLoading ? (
            <StatusLoadingSkeleton rows={4} />
          ) : (
            <>
              <div style={statusRow}>
                <span>Version</span>
                <span style={statusVal}>v{health?.version ?? '--'}</span>
              </div>
              <div style={statusRow}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                  Uptime
                </span>
                <span style={statusVal}>
                  {health ? formatUptime(health.uptime_seconds) : '--'}
                </span>
              </div>
              <div style={statusRow}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Monitor size={14} style={{ color: 'var(--text-muted)' }} />
                  Platform
                </span>
                <span style={statusVal}>{health?.platform ?? '--'}</span>
              </div>
              <div style={statusRowLast}>
                <span>Hostname</span>
                <span style={statusVal}>{health?.hostname ?? '--'}</span>
              </div>
            </>
          )}
        </div>

        {/* React Query Cache */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <RefreshCw size={14} />
            React Query Cache
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
          }}>
            <StatusStatCard label="Total Queries" value={allQueries.length} />
            <StatusStatCard label="Stale Queries" value={staleQueries.length} accent={staleQueries.length > 0 ? '#eab308' : undefined} />
            <StatusStatCard label="Active Fetches" value={allQueries.filter(q => q.state.fetchStatus === 'fetching').length} accent="#22c55e" />
          </div>
        </div>
      </div>
    </div>
  )
})

export default function SettingsPage() {
  const [searchParams] = useSearchParams()
  const setupMfaRequired = searchParams.get('setup_mfa') === '1'
  const initialSection = searchParams.get('section') as SettingsSection | null
  const [selected, setSelected] = useState<SettingsSection | null>(initialSection)
  const [focusedSectionIndex, setFocusedSectionIndex] = useState(-1)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [userName, setUserName] = useLocalStorageState('user-name', 'User')
  const [userAvatar, setUserAvatar] = useLocalStorageState('user-avatar', '🦍')
  const [editingName, setEditingName] = useState(false)
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [nameInput, setNameInput] = useState(userName)
  const [avatarInput, setAvatarInput] = useState(userAvatar)
  const [nameSaved, setNameSaved] = useState(false)
  const [avatarSaved, setAvatarSaved] = useState(false)
  const bindings = useSyncExternalStore(subscribeKeybindings, getKeybindings)
  const [editingBindingId, setEditingBindingId] = useState<string | null>(null)
  const keybindHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  const [detectingMod, setDetectingMod] = useState(false)
  const modKey = useSyncExternalStore(subscribeKeybindings, getModifierKey)
  const modList = useSyncExternalStore(subscribeKeybindings, getModifierList)
  const dragModRef = useRef<number | null>(null)

  useEffect(() => {
    if (!detectingMod) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      const mod = keyToModifier(e.key)
      if (mod) {
        addModifier(mod)
        setDetectingMod(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [detectingMod])

  // Clean up stale keydown listener when editingBindingId is cleared (e.g. Cancel click)
  useEffect(() => {
    if (editingBindingId === null && keybindHandlerRef.current) {
      window.removeEventListener('keydown', keybindHandlerRef.current)
      keybindHandlerRef.current = null
    }
  }, [editingBindingId])
  // Connections state
  const [bbUrl, setBbUrl] = useState('')
  const [ocUrl, setOcUrl] = useState('')
  const [bbExpectedHost, setBbExpectedHost] = useState('')
  const [ocExpectedHost, setOcExpectedHost] = useState('')
  const [connSaving, setConnSaving] = useState(false)
  const [connSaveStatus, setConnSaveStatus] = useState<string | null>(null)
  const [connTesting, setConnTesting] = useState(false)
  const [connResults, setConnResults] = useState<Record<string, { status: string; latency_ms?: number; error?: string; peer_hostname?: string; peer_verified?: boolean }> | null>(null)

  // Load saved connection URLs from keychain + expected hostnames from prefs
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string | null>('get_secret', { key: 'bluebubbles.host' }).then(v => { if (v) setBbUrl(v) })
      invoke<string | null>('get_secret', { key: 'openclaw.api-url' }).then(v => { if (v) setOcUrl(v) })
    })
    // Load expected hostnames from user preferences
    api.get<{ ok: boolean; data: Record<string, unknown> }>('/api/user-preferences').then(resp => {
      const prefs = (resp as any)?.data ?? resp
      if (prefs?.['bluebubbles.expected-host']) setBbExpectedHost(String(prefs['bluebubbles.expected-host']))
      if (prefs?.['openclaw.expected-host']) setOcExpectedHost(String(prefs['openclaw.expected-host']))
    }).catch(() => {})
  }, [])

  const saveConnections = useCallback(async () => {
    setConnSaving(true)
    setConnSaveStatus(null)
    try {
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_secret', { key: 'bluebubbles.host', value: bbUrl })
        await invoke('set_secret', { key: 'openclaw.api-url', value: ocUrl })
      }
      // Save expected hostnames to user preferences
      await api.patch('/api/user-preferences', {
        preferences: {
          'bluebubbles.expected-host': bbExpectedHost,
          'openclaw.expected-host': ocExpectedHost,
        }
      }).catch(() => {})
      setConnSaveStatus('Saved. Restart to apply changes.')
    } catch (e: unknown) {
      setConnSaveStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConnSaving(false)
    }
  }, [bbUrl, ocUrl, bbExpectedHost, ocExpectedHost])

  const testConnections = useCallback(async () => {
    setConnTesting(true)
    setConnResults(null)
    try {
      const data = await api.get<Record<string, { status: string; latency_ms?: number; error?: string }>>('/api/status/connections')
      setConnResults(data)
    } catch {
      setConnResults({ _error: { status: 'error', error: 'Could not reach backend' } })
    } finally {
      setConnTesting(false)
    }
  }, [])

  const [dndEnabled, setDndEnabled] = useLocalStorageState('dnd-enabled', false)
  const [systemNotifs, setSystemNotifs] = useLocalStorageState('system-notifs', true)
  const [inAppNotifs, setInAppNotifs] = useLocalStorageState('in-app-notifs', true)
  const [notifSound, setNotifSound] = useLocalStorageState('notif-sound', true)
  const [ntfyUrl, setNtfyUrl] = useState('')
  const [ntfyTopic, setNtfyTopic] = useState('mission-control')
  const [ntfyStatus, setNtfyStatus] = useState<string | null>(null)
  const [ntfyTesting, setNtfyTesting] = useState(false)
  const [errorReporting, setErrorReporting] = useLocalStorageState('error-reporting', false)
  const titleBarVisible = useSyncExternalStore(subscribeTitleBarSettings, getTitleBarVisible)
  const titleBarAutoHide = useSyncExternalStore(subscribeTitleBarSettings, getTitleBarAutoHide)
  const sidebarHeaderVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarHeaderVisible)
  const sidebarLogoVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarLogoVisible)
  const sidebarTitleSize = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleSize)
  const sidebarSearchVisible = useSyncExternalStore(subscribeSidebarSettings, getSidebarSearchVisible)
  const sidebarDefaultWidth = useSyncExternalStore(subscribeSidebarSettings, getSidebarDefaultWidth)
  const sidebarTitleLayout = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleLayout)
  const sidebarTitleText = useSyncExternalStore(subscribeSidebarSettings, getSidebarTitleText)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleBeforeEdit = useRef('')
  const titleSaved = useRef(false)
  const [theme, setThemeState] = useLocalStorageState<'dark' | 'light' | 'system'>('theme', 'dark')
  const [accentColor, setAccentColor] = useLocalStorageState('accent-color', DEFAULT_ACCENT)
  const [glowColor, setGlowColor] = useLocalStorageState('glow-color', DEFAULT_GLOW)
  const [secondaryColor, setSecondaryColor] = useLocalStorageState('secondary-color', DEFAULT_SECONDARY)
  const [logoColor, setLogoColor] = useLocalStorageState('logo-color', DEFAULT_LOGO)
  const enabledModules = useSyncExternalStore(subscribeModules, getEnabledModules)
  const sidebarConfig = useSyncExternalStore(subscribeSidebarConfig, getSidebarConfig)

  // Module drag-and-drop state
  const [modDragHref, setModDragHref] = useState<string | null>(null)
  const [modDragFromCat, setModDragFromCat] = useState<string | null>(null)
  const [modDropCat, setModDropCat] = useState<string | null>(null)
  const [modDropIdx, setModDropIdx] = useState<number>(-1)
  const [editingModItem, setEditingModItem] = useState<string | null>(null)
  const [editingModCat, setEditingModCat] = useState<string | null>(null)
  const [modEditValue, setModEditValue] = useState('')
  const [settingsCtxMenu, setSettingsCtxMenu] = useState<ContextMenuState | null>(null)

  // Sidebar settings column widths (resizable)
  const [sbLeftW, setSbLeftW] = useState(420)
  const [sbMidW, setSbMidW] = useState(200)

  const GAP_BETWEEN_PANELS = 16 // must match GAP in ResizablePanel

  // Panel rects for collision detection + swap
  const [panelRects, setPanelRects] = useState<Record<string, PanelRect>>({})
  const [swapRev, setSwapRev] = useState(0)
  const [forceRects, setForceRects] = useState<Record<string, PanelRect & { _rev: number }>>({})
  const [swapHoverTarget, setSwapHoverTarget] = useState<string | null>(null)

  // Check if a rect overlaps any panel except the given IDs (with gap)
  const wouldOverlapOthers = useCallback((rect: PanelRect, excludeIds: string[]): boolean => {
    const g = GAP_BETWEEN_PANELS
    for (const [id, r] of Object.entries(panelRects)) {
      if (excludeIds.includes(id)) continue
      const inflated = { x: r.x - g, y: r.y - g, w: r.w + g * 2, h: r.h + g * 2 }
      if (rect.x < inflated.x + inflated.w && rect.x + rect.w > inflated.x && rect.y < inflated.y + inflated.h && rect.y + rect.h > inflated.y) return true
    }
    return false
  }, [panelRects])
  const updatePanelRect = useCallback((id: string) => (rect: PanelRect) => {
    setPanelRects(prev => ({ ...prev, [id]: rect }))
  }, [])
  const getSiblings = useCallback((id: string): (PanelRect & { id: string })[] => {
    return Object.entries(panelRects).filter(([k]) => k !== id).map(([k, v]) => ({ ...v, id: k }))
  }, [panelRects])
  const handleSwap = useCallback((fromId: string) => (targetId: string) => {
    const a = panelRects[fromId]
    const b = panelRects[targetId]
    if (!a || !b) return
    const rev = swapRev + 1
    setSwapRev(rev)
    setForceRects({
      [fromId]: { x: b.x, y: b.y, w: b.w, h: b.h, _rev: rev },
      [targetId]: { x: a.x, y: a.y, w: a.w, h: a.h, _rev: rev },
    })
  }, [panelRects, swapRev])

  const handleColResize = useCallback((setter: (w: number) => void, min: number, max: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const el = e.currentTarget.previousElementSibling as HTMLElement
    const startW = el?.offsetWidth || 200
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(min, Math.min(max, startW + (ev.clientX - startX)))
      setter(w)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const setAccent = (color: string) => {
    setAccentColor(color)
    applyAccentColor(color)
    if (color === DEFAULT_ACCENT) {
      delete document.documentElement.dataset.accent
    } else {
      document.documentElement.dataset.accent = color
    }
  }

  const setGlow = (color: string) => {
    setGlowColor(color)
    applyGlowColor(color)
  }

  const setSecondary = (color: string) => {
    setSecondaryColor(color)
    applySecondaryColor(color)
  }

  const setLogo = (color: string) => {
    setLogoColor(color)
    applyLogoColor(color)
  }

  const applyTheme = (t: 'dark' | 'light' | 'system') => {
    let resolved: 'dark' | 'light' = t === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : t
    document.documentElement.dataset.theme = resolved
  }

  const setTheme = (t: 'dark' | 'light' | 'system') => {
    setThemeState(t)
    applyTheme(t)
  }
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleTitleBar = (show: boolean) => {
    setTitleBarVisible(show)
  }

  // Auth & MFA state
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwStatus, setPwStatus] = useState<string | null>(null)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaStatus, setMfaStatus] = useState<string | null>(null)
  // supabase is a pre-initialized singleton from @/lib/supabase/client

  const { data: agentStatus } = useQuery<{ name: string; emoji: string; model: string; status: string; host: string }>({
    queryKey: queryKeys.status,
    queryFn: () => api.get('/api/status'),
  })

  const { data: prefsData } = useQuery<{ prefs: Pref[] }>({
    queryKey: queryKeys.prefs,
    queryFn: () => api.get<{ prefs: Pref[] }>('/api/prefs'),
    meta: { onSettled: true },
  })

  useEffect(() => {
    if (prefsData?.prefs) {
      for (const p of prefsData.prefs) {
        if (p.key === 'ntfy_url' && p.value) setNtfyUrl(p.value)
        if (p.key === 'ntfy_topic' && p.value) setNtfyTopic(p.value)
      }
    }
  }, [prefsData])

  const { data: authUserData } = useQuery({
    queryKey: queryKeys.authUser,
    queryFn: async () => {
      if (!supabase) return { user: null, mfaData: null }
      const { data: { user } } = await supabase!.auth.getUser()
      const { data: mfaData } = await supabase!.auth.mfa.listFactors()
      return { user, mfaData }
    },
  })

  useEffect(() => {
    if (authUserData?.user) {
      setUserEmail(authUserData.user.email ?? null)
      setHasPassword(authUserData.user.identities?.some(i => i.provider === 'email') ?? false)
    }
    if (authUserData?.mfaData?.totp && authUserData.mfaData.totp.length > 0) {
      setMfaEnabled(authUserData.mfaData.totp.some(f => f.status === 'verified'))
    }
  }, [authUserData])

  const saveNtfyMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        api.patch('/api/prefs', { key: 'ntfy_url', value: ntfyUrl }),
        api.patch('/api/prefs', { key: 'ntfy_topic', value: ntfyTopic }),
      ])
    },
    onSuccess: () => setNtfyStatus('Saved.'),
    onError: () => setNtfyStatus('Error saving.'),
  })

  async function testNtfy() {
    setNtfyTesting(true)
    setNtfyStatus(null)
    try {
      const json = await api.post<{ ok?: boolean; error?: string }>('/api/notify', {
        title: 'Mission Control',
        message: 'Test notification from Mission Control',
        priority: 3,
        tags: ['bell'],
      })
      setNtfyStatus(json.ok ? 'Notification sent!' : `Error: ${json.error}`)
    } catch (e: unknown) {
      setNtfyStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setNtfyTesting(false)
    }
  }

  function renderDetail() {
    switch (selected) {
      case 'agent':
        return (
          <div>
            <div style={sectionLabel}>Agent Configuration</div>
            <div style={row}><span>Name</span><span style={val}>{agentStatus?.name ?? '—'}</span></div>
            <div style={row}><span>Model</span><span style={val}>{agentStatus?.model ?? '—'}</span></div>
            <div style={row}><span>Status</span><span style={{ ...val, color: agentStatus?.status === 'online' ? 'var(--green)' : undefined }}>{agentStatus?.status ?? '—'}</span></div>
            <div style={rowLast}><span>Emoji</span><span style={{ fontSize: '18px' }}>{agentStatus?.emoji ?? '—'}</span></div>
          </div>
        )
      case 'gateway':
        return (
          <div>
            <div style={sectionLabel}>Gateway Connection</div>
            <div style={row}><span>WebSocket</span><span style={val}>{import.meta.env.VITE_OPENCLAW_WS || 'not configured'}</span></div>
            <div style={row}><span>HTTP</span><span style={val}>{import.meta.env.VITE_OPENCLAW_HTTP || 'not configured'}</span></div>
            <div style={rowLast}><span>Auth</span><span style={val}>password</span></div>
          </div>
        )
      case 'app':
        return (
          <AppSection />
        )
      case 'user':
        return (
          <div>
            <div style={sectionLabel}>User Profile</div>
            <div style={row}>
              <span>Name</span>
              {!editingName ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => { setNameInput(userName); setEditingName(true) }} style={{ ...val, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {userName} <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>edit</span>
                  </button>
                  {nameSaved && <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 500, animation: 'fadeIn 0.15s ease' }}>Saved</span>}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input value={nameInput} onChange={e => setNameInput(e.target.value)} autoFocus
                    style={{ ...inputStyle, width: '160px' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setUserName(nameInput); setEditingName(false); setNameSaved(true); setTimeout(() => setNameSaved(false), 1500) }
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                  />
                  <button style={btnStyle} onClick={() => { setUserName(nameInput); setEditingName(false); setNameSaved(true); setTimeout(() => setNameSaved(false), 1500) }}>Save</button>
                  <button style={btnSecondary} onClick={() => setEditingName(false)}>Cancel</button>
                </div>
              )}
            </div>
            <div style={row}>
              <span>Avatar</span>
              {!editingAvatar ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => { setAvatarInput(userAvatar); setEditingAvatar(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '24px' }}>
                    {userAvatar} <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>edit</span>
                  </button>
                  {avatarSaved && <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 500, animation: 'fadeIn 0.15s ease' }}>Saved</span>}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input value={avatarInput} onChange={e => setAvatarInput(e.target.value)} autoFocus
                    style={{ ...inputStyle, width: '80px', fontSize: '20px', textAlign: 'center' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setUserAvatar(avatarInput); setEditingAvatar(false); setAvatarSaved(true); setTimeout(() => setAvatarSaved(false), 1500) }
                      if (e.key === 'Escape') setEditingAvatar(false)
                    }}
                  />
                  <button style={btnStyle} onClick={() => { setUserAvatar(avatarInput); setEditingAvatar(false); setAvatarSaved(true); setTimeout(() => setAvatarSaved(false), 1500) }}>Save</button>
                  <button style={btnSecondary} onClick={() => setEditingAvatar(false)}>Cancel</button>
                </div>
              )}
            </div>

            {/* Account & Security — merged from security section */}
            <div style={{ ...sectionLabel, marginTop: '24px' }}>Account & Security</div>
            {isDemoMode() && (<div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: 'var(--warning)' }}>Account & security features are unavailable in demo mode.</div>)}
            {setupMfaRequired && !mfaEnabled && (
              <div style={{
                background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.25)',
                borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px',
                color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <Shield size={16} />
                Two-factor authentication is required. Set up your authenticator below.
              </div>
            )}
            <div style={row}><span>Email</span><span style={val}>{userEmail ?? '—'}</span></div>
            {hasPassword && (
              <div style={row}>
                <span>Password</span>
                {!changingPw ? (
                  <button style={btnSecondary} onClick={() => { setChangingPw(true); setPwStatus(null) }}>Change</button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" autoComplete="new-password" aria-label="New password" style={{ ...inputStyle, width: '200px' }} />
                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm password" autoComplete="new-password" aria-label="Confirm password" style={{ ...inputStyle, width: '200px' }} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={btnSecondary} onClick={() => { setChangingPw(false); setNewPw(''); setConfirmPw(''); setPwStatus(null) }}>Cancel</button>
                      <button
                        style={newPw.length >= 8 && newPw === confirmPw ? btnStyle : { ...btnStyle, opacity: 0.4, cursor: 'not-allowed' }}
                        disabled={newPw.length < 8 || newPw !== confirmPw}
                        onClick={async () => {
                          setPwStatus(null)
                          const { error } = await supabase!.auth.updateUser({ password: newPw })
                          if (error) { setPwStatus(`Error: ${error.message}`) }
                          else { setPwStatus('Password updated.'); setChangingPw(false); setNewPw(''); setConfirmPw('') }
                        }}
                      >Save</button>
                    </div>
                    {pwStatus && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: pwStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{pwStatus}</span>}
                  </div>
                )}
              </div>
            )}
            <div style={row}>
              <span>Two-factor (TOTP)</span>
              <span style={{ ...val, color: mfaEnabled ? 'var(--green)' : 'var(--text-muted)' }}>{mfaEnabled ? 'Enabled' : 'Not set up'}</span>
            </div>
            {!mfaEnabled && !mfaEnrolling && (
              <div style={{ padding: '8px 0' }}>
                <button style={btnStyle} onClick={async () => {
                  setMfaStatus(null)
                  const { data, error } = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Mission Control' })
                  if (error) { setMfaStatus(`Error: ${error.message}`); return }
                  setMfaFactorId(data.id); setMfaQr(data.totp.qr_code); setMfaSecret(data.totp.secret); setMfaEnrolling(true)
                }}>Set up authenticator</button>
                {mfaStatus && <span style={{ fontSize: '12px', fontFamily: 'monospace', color: mfaStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)', marginLeft: '10px' }}>{mfaStatus}</span>}
              </div>
            )}
            {mfaEnrolling && (
              <div style={{ padding: '16px 0 4px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Scan with your authenticator app:</p>
                {mfaQr && <div style={{ display: 'flex', justifyContent: 'center', padding: '16px', background: '#fff', borderRadius: '10px', width: 'fit-content' }}><img src={mfaQr} alt="TOTP QR" width={180} height={180} /></div>}
                {mfaSecret && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Key: <span style={{ color: 'var(--text-secondary)', userSelect: 'all' }}>{mfaSecret}</span></div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" autoFocus aria-label="MFA verification code" style={{ ...inputStyle, width: '140px', textAlign: 'center', letterSpacing: '0.15em' }} />
                  <button style={mfaCode.length === 6 ? btnStyle : { ...btnStyle, opacity: 0.4, cursor: 'not-allowed' }} disabled={mfaCode.length !== 6} onClick={async () => {
                    setMfaStatus(null); if (!mfaFactorId) return
                    const { data: ch, error: chErr } = await supabase!.auth.mfa.challenge({ factorId: mfaFactorId })
                    if (chErr) { setMfaStatus(`Error: ${chErr.message}`); return }
                    const { error: vErr } = await supabase!.auth.mfa.verify({ factorId: mfaFactorId, challengeId: ch.id, code: mfaCode })
                    if (vErr) { setMfaStatus(`Error: ${vErr.message}`); setMfaCode(''); return }
                    setMfaEnabled(true); setMfaEnrolling(false); setMfaQr(null); setMfaSecret(null); setMfaCode(''); setMfaStatus(null)
                    if (setupMfaRequired) window.location.href = '/'
                  }}>Verify</button>
                  <button style={btnSecondary} onClick={async () => { if (mfaFactorId) await supabase!.auth.mfa.unenroll({ factorId: mfaFactorId }); setMfaEnrolling(false); setMfaQr(null); setMfaSecret(null); setMfaCode(''); setMfaFactorId(null); setMfaStatus(null) }}>Cancel</button>
                </div>
                {mfaStatus && <span style={{ fontSize: '12px', fontFamily: 'monospace', color: mfaStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{mfaStatus}</span>}
              </div>
            )}
            {mfaEnabled && !mfaEnrolling && (
              <div style={{ padding: '12px 0 0' }}>
                <button style={{ ...btnSecondary, color: 'var(--red)', borderColor: 'rgba(248, 113, 113, 0.3)' }} onClick={async () => {
                  const { data } = await supabase!.auth.mfa.listFactors()
                  const totp = data?.totp?.find(f => f.status === 'verified')
                  if (totp) { await supabase!.auth.mfa.unenroll({ factorId: totp.id }); setMfaEnabled(false) }
                }}>Remove authenticator</button>
              </div>
            )}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={async () => { await supabase!.auth.signOut(); window.location.href = '/login' }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: 500,
                  background: 'transparent', border: '1px solid rgba(248, 113, 113, 0.25)', borderRadius: '8px',
                  color: 'var(--red)', cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248, 113, 113, 0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <LogOut size={14} />Sign out
              </button>
            </div>
          </div>
        )
      case 'connections': {
        const statusDot = (s?: string) => ({
          display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px',
          background: s === 'ok' ? 'var(--green)' : s === 'not_configured' ? 'var(--text-muted)' : 'var(--red)',
        })
        const statusLabel = (r?: { status: string; latency_ms?: number; error?: string; peer_hostname?: string; peer_verified?: boolean }) => {
          if (!r) return null
          const parts: React.ReactNode[] = []
          if (r.status === 'ok') parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--green)', fontFamily: 'monospace' }}><span style={statusDot('ok')} />OK ({r.latency_ms}ms)</span>)
          else if (r.status === 'not_configured') parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}><span style={statusDot('not_configured')} />Not configured</span>)
          else parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'monospace' }}><span style={statusDot('error')} />{r.error || r.status}</span>)
          // Peer verification badge
          if (r.peer_verified === true) {
            parts.push(<span key="pv" style={{ fontSize: '10px', color: 'var(--green)', fontFamily: 'monospace', marginLeft: '8px' }} title={`Peer: ${r.peer_hostname}`}>peer ok</span>)
          } else if (r.peer_verified === false) {
            parts.push(<span key="pv" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#e5a00d', fontFamily: 'monospace', marginLeft: '8px' }} title={`Peer hostname "${r.peer_hostname}" does not match expected`}><AlertTriangle size={11} />peer mismatch</span>)
          } else if (r.peer_hostname) {
            parts.push(<span key="pv" style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: '8px' }} title="No expected hostname configured">peer: {r.peer_hostname}</span>)
          }
          return <>{parts}</>
        }
        const hostInputStyle: React.CSSProperties = { ...inputStyle, width: '140px', fontSize: '11px' }
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '(not set)'
        return (
          <div>
            {isDemoMode() && (<div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0 }} /><span style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>You're in demo mode</span></div><p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>No services are connected. The app is showing sample data so you can explore the interface. To use real data, set the following environment variables and restart:</p><div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.8 }}><div><span style={{ color: 'var(--accent)' }}>VITE_SUPABASE_URL</span>=https://your-project.supabase.co</div><div><span style={{ color: 'var(--accent)' }}>VITE_SUPABASE_ANON_KEY</span>=your-anon-key</div></div><p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>Then configure BlueBubbles and OpenClaw URLs below (saved to OS keychain).</p></div>)}
            <div style={sectionLabel}>Service Connections</div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Configure URLs for external services. Changes are saved to the OS keychain and take effect on restart.
              Set expected Tailscale hostnames to verify peer identity.
            </p>

            <div style={row}>
              <div style={{ flex: 1 }}>
                <span>BlueBubbles</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>iMessage bridge server URL</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <input
                  style={inputStyle}
                  value={bbUrl}
                  onChange={e => setBbUrl(e.target.value)}
                  placeholder="http://100.x.x.x:1234"
                  aria-label="BlueBubbles URL"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Expected host:</span>
                  <input
                    style={hostInputStyle}
                    value={bbExpectedHost}
                    onChange={e => setBbExpectedHost(e.target.value)}
                    placeholder="e.g. macbook"
                    aria-label="BlueBubbles expected Tailscale hostname"
                  />
                </div>
                {connResults?.bluebubbles && statusLabel(connResults.bluebubbles)}
              </div>
            </div>

            <div style={row}>
              <div style={{ flex: 1 }}>
                <span>OpenClaw API</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Remote AI workspace API</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <input
                  style={inputStyle}
                  value={ocUrl}
                  onChange={e => setOcUrl(e.target.value)}
                  placeholder="http://100.x.x.x:18789"
                  aria-label="OpenClaw API URL"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Expected host:</span>
                  <input
                    style={hostInputStyle}
                    value={ocExpectedHost}
                    onChange={e => setOcExpectedHost(e.target.value)}
                    placeholder="e.g. openclaw-vm"
                    aria-label="OpenClaw expected Tailscale hostname"
                  />
                </div>
                {connResults?.openclaw && statusLabel(connResults.openclaw)}
              </div>
            </div>

            <div style={rowLast}>
              <div style={{ flex: 1 }}>
                <span>Supabase</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Database backend (read-only, from env)</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{ ...val, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supabaseUrl}</span>
                {connResults?.supabase && statusLabel(connResults.supabase)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={btnStyle} onClick={saveConnections} disabled={connSaving}>
                {connSaving ? 'Saving...' : 'Save'}
              </button>
              <button style={btnSecondary} onClick={testConnections} disabled={connTesting}>
                {connTesting ? 'Testing...' : 'Test All'}
              </button>
              {connSaveStatus && (
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: connSaveStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                  {connSaveStatus}
                </span>
              )}
            </div>

            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Setup Wizard</span>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Re-run the first-time setup wizard to reconfigure all connections
                  </div>
                </div>
                <button
                  style={btnSecondary}
                  onClick={() => {
                    resetSetupWizard()
                    setShowSetupWizard(true)
                  }}
                >
                  Re-run Setup
                </button>
              </div>
            </div>
            {showSetupWizard && (
              <OnboardingWelcome forceOpen onClose={() => setShowSetupWizard(false)} />
            )}
          </div>
        )
      }
      case 'display':
        return (
          <div>
            <div style={sectionLabel}>Display</div>
            <div style={row}>
              <span>Theme</span>
              <div style={{ display: 'flex', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {([
                  { value: 'dark' as const, icon: Moon, label: 'Dark' },
                  { value: 'light' as const, icon: Sun, label: 'Light' },
                  { value: 'system' as const, icon: Laptop, label: 'System' },
                ]).map(({ value, icon: Icon, label }) => {
                  const active = theme === value
                  return (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      aria-label={label}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', border: 'none', cursor: 'pointer',
                        fontSize: '12px', fontWeight: active ? 600 : 400,
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
            {[
              { label: 'Accent color', value: accentColor, onChange: setAccent },
              { label: 'Secondary color', value: secondaryColor, onChange: setSecondary },
              { label: 'Glow color', value: glowColor, onChange: setGlow },
              { label: 'Logo color', value: logoColor, onChange: setLogo },
            ].map(({ label, value, onChange }) => (
              <div key={label} style={row}>
                <span>{label}</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {ACCENT_PRESETS.map(preset => {
                    const active = value === preset.color
                    return (
                      <button
                        key={preset.id}
                        onClick={() => onChange(preset.color)}
                        aria-label={`${label} ${preset.label}`}
                        title={preset.label}
                        style={{
                          width: 24, height: 24,
                          borderRadius: '50%',
                          background: preset.color,
                          border: active ? '2px solid var(--text-primary)' : '2px solid transparent',
                          outline: active ? `2px solid ${preset.color}` : 'none',
                          outlineOffset: '2px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          transform: active ? 'scale(1.15)' : 'scale(1)',
                          padding: 0,
                        }}
                      />
                    )
                  })}
                  <label
                    title="Pick custom color"
                    style={{
                      width: 24, height: 24,
                      borderRadius: '50%',
                      background: `conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)`,
                      cursor: 'pointer',
                      position: 'relative',
                      border: ACCENT_PRESETS.every(p => p.color !== value) ? '2px solid var(--text-primary)' : '2px solid transparent',
                      outline: ACCENT_PRESETS.every(p => p.color !== value) ? `2px solid ${value}` : 'none',
                      outlineOffset: '2px',
                      transition: 'all 0.15s ease',
                      transform: ACCENT_PRESETS.every(p => p.color !== value) ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    <input
                      type="color"
                      value={value}
                      onChange={e => onChange(e.target.value)}
                      aria-label={`${label} custom color picker`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        opacity: 0,
                        width: '100%',
                        height: '100%',
                        cursor: 'pointer',
                        border: 'none',
                        padding: 0,
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )
      case 'keybindings':
        return (
          <div>
            <div style={sectionLabel}>Keybinds</div>
            <div style={row}>
              <span>Modifier keys</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                {modList.map((m, i) => (
                  <div
                    key={m}
                    onMouseDown={e => {
                      if ((e.target as HTMLElement).tagName === 'BUTTON') return
                      e.preventDefault()
                      const el = e.currentTarget as HTMLElement
                      const startX = e.clientX
                      const container = el.parentElement!
                      const siblings = Array.from(container.querySelectorAll<HTMLElement>('[data-mod-drag]'))
                      const centers = siblings.map(s => {
                        const r = s.getBoundingClientRect()
                        return r.left + r.width / 2
                      })

                      el.style.zIndex = '10'
                      el.style.transition = 'none'
                      document.body.style.cursor = 'grabbing'

                      const onMove = (ev: MouseEvent) => {
                        const dx = ev.clientX - startX
                        el.style.transform = `translateX(${dx}px) scale(1.05)`
                        el.style.opacity = '0.9'
                      }
                      const onUp = (ev: MouseEvent) => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                        document.body.style.cursor = ''
                        el.style.transform = ''
                        el.style.opacity = ''
                        el.style.zIndex = ''
                        el.style.transition = ''

                        // Find drop target based on final mouse position
                        const finalX = ev.clientX
                        let target = i
                        for (let j = 0; j < centers.length; j++) {
                          if (j < i && finalX < centers[j]) { target = j; break }
                          if (j > i && finalX > centers[j]) { target = j }
                        }
                        if (target !== i) {
                          const next = [...modList]
                          const [moved] = next.splice(i, 1)
                          next.splice(target, 0, moved)
                          reorderModifiers(next)
                        }
                      }
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                    data-mod-drag
                    style={{
                      display: 'flex', alignItems: 'center', gap: '2px', cursor: 'grab',
                      position: 'relative', transition: 'transform 0.15s ease',
                    }}
                  >
                    <kbd style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: i === 0 ? '#fff' : 'var(--text-primary)',
                      background: i === 0 ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.08)',
                      border: `1px solid ${i === 0 ? 'var(--border-accent)' : 'rgba(255,255,255,0.1)'}`,
                      pointerEvents: 'none',
                    }}>{modLabel(m)}</kbd>
                    {modList.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); removeModifier(m) }}
                        aria-label={`Remove ${modLabel(m)}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', fontSize: '10px', padding: '2px',
                          lineHeight: 1, display: 'flex',
                        }}
                      >✕</button>
                    )}
                  </div>
                ))}
                {detectingMod ? (
                  <input
                    autoFocus
                    readOnly
                    onKeyDown={e => {
                      e.preventDefault()
                      if (e.key === 'Escape') { setDetectingMod(false); return }
                      const mod = keyToModifier(e.key)
                      if (!modList.includes(mod)) {
                        addModifier(mod)
                      }
                      setDetectingMod(false)
                    }}
                    onBlur={() => setDetectingMod(false)}
                    placeholder="Press key..."
                    style={{
                      width: '90px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: "'JetBrains Mono', monospace",
                      background: 'rgba(167,139,250,0.1)',
                      border: '1px solid var(--accent)',
                      color: 'var(--accent)',
                      textAlign: 'center',
                      caretColor: 'transparent',
                      animation: 'pulse-dot 1.5s infinite',
                    }}
                  />
                ) : (
                  modList.length < 4 && (
                    <button
                      onClick={() => setDetectingMod(true)}
                      style={{
                        width: '26px', height: '26px', borderRadius: '6px', fontSize: '14px',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                        color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >+</button>
                  )
                )}
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Click a keybinding to change it.
            </div>
            {bindings.map(b => {
              const kbdStyle: React.CSSProperties = {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '24px', height: '26px', padding: '0 8px', borderRadius: '6px',
                fontSize: '12px', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-primary)', background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }
              const isEditing = editingBindingId === b.id
              return (
                <div key={b.id} style={row}>
                  <span>{b.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {/* Modifier selector — cycle through options on click */}
                    {b.mod && (
                      <button
                        onClick={() => {
                          const mods = getModifierList()
                          const current = getBindingMod(b)
                          const idx = mods.indexOf(current)
                          const next = mods[(idx + 1) % mods.length]
                          updateKeybinding(b.id, { modifier: next })
                        }}
                        title="Click to change modifier"
                        style={{ ...kbdStyle, cursor: 'pointer', background: 'rgba(167,139,250,0.1)' }}
                      >
                        {modLabel(getBindingMod(b))}
                      </button>
                    )}
                    {/* Key — click to detect */}
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <kbd style={{
                          ...kbdStyle,
                          background: 'rgba(167,139,250,0.15)', border: '1px solid var(--accent)',
                          color: 'var(--accent)', animation: 'pulse-dot 1.5s infinite',
                          padding: '0 12px',
                        }}>
                          Press key...
                        </kbd>
                        <button style={{ ...kbdStyle, cursor: 'pointer', fontSize: '10px', padding: '0 6px' }}
                          onClick={() => setEditingBindingId(null)}>✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingBindingId(b.id)
                          if (keybindHandlerRef.current) {
                            window.removeEventListener('keydown', keybindHandlerRef.current)
                          }
                          const handler = (e: KeyboardEvent) => {
                            e.preventDefault()
                            window.removeEventListener('keydown', handler)
                            keybindHandlerRef.current = null
                            if (e.key === 'Escape') { setEditingBindingId(null); return }
                            if (keyToModifier(e.key)) return // ignore modifier-only presses
                            const key = e.key.toLowerCase()
                            if (key.length === 1 || key === '/') {
                              updateKeybinding(b.id, { key })
                              setEditingBindingId(null)
                            }
                          }
                          keybindHandlerRef.current = handler
                          setTimeout(() => window.addEventListener('keydown', handler, { once: true }), 50)
                        }}
                        style={{ ...kbdStyle, cursor: 'pointer' }}
                      >
                        {b.key.toUpperCase()}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop: '16px' }}>
              <button style={{ ...btnSecondary, color: 'var(--text-muted)' }} onClick={() => { resetKeybindings(); setEditingBindingId(null) }}>
                Reset to defaults
              </button>
            </div>
          </div>
        )
      case 'modules': {
        const toggleModule = (id: string) => {
          const current = getEnabledModules()
          const next = current.includes(id)
            ? current.filter(m => m !== id)
            : [...current, id]
          setEnabledModules(next)
        }

        // Resolve a nav item by href (built-in or custom module)
        const resolveItem = (href: string): { icon: React.ElementType; label: string; moduleId?: string } | null => {
          const navItem = navItemsByHref.get(href)
          if (navItem) return navItem
          if (href.startsWith('/custom/')) {
            const modId = href.slice('/custom/'.length)
            const customMod = (sidebarConfig.customModules || []).find(m => m.id === modId)
            if (customMod) return { icon: FileText, label: customMod.name }
          }
          return null
        }

        const handleModDragStart = (href: string, catId: string) => (e: React.DragEvent) => {
          setModDragHref(href)
          setModDragFromCat(catId)
          e.dataTransfer.setData('text/plain', href)
          e.dataTransfer.effectAllowed = 'move'
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '0.4'
          }
        }

        const handleModDragEnd = (e: React.DragEvent) => {
          setModDragHref(null)
          setModDragFromCat(null)
          setModDropCat(null)
          setModDropIdx(-1)
          setSwapHoverTarget(null)
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '1'
          }
        }

        const handleModDragOver = (catId: string, index: number) => (e: React.DragEvent) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setModDropCat(catId)
          setModDropIdx(index)
        }

        const handleModDrop = (catId: string, index: number) => (e: React.DragEvent) => {
          e.preventDefault()
          const draggedHref = modDragHref || e.dataTransfer.getData('text/plain')
          const fromCat = modDragFromCat
          if (!draggedHref || !fromCat) return

          // Dragging from Unused into a category — just re-enable (item is already in category list)
          if (fromCat === '__unused__') {
            const item = resolveItem(draggedHref)
            if (item?.moduleId && !enabledModules.includes(item.moduleId)) {
              toggleModule(item.moduleId)
            }
            setModDragHref(null)
            setModDragFromCat(null)
            setModDropCat(null)
            setModDropIdx(-1)
            return
          }

          const config = getSidebarConfig()
          const newCategories = config.categories.map(c => ({ ...c, items: [...c.items] }))

          const sourceCat = newCategories.find(c => c.id === fromCat)
          if (sourceCat) {
            sourceCat.items = sourceCat.items.filter(h => h !== draggedHref)
          }

          const targetCat = newCategories.find(c => c.id === catId)
          if (targetCat) {
            let adjustedIndex = index
            if (fromCat === catId) {
              const oldIndex = config.categories.find(c => c.id === catId)!.items.indexOf(draggedHref)
              if (oldIndex < index) adjustedIndex = Math.max(0, index - 1)
            }
            targetCat.items.splice(adjustedIndex, 0, draggedHref)
          }

          setSidebarConfig({ ...config, categories: newCategories })
          setModDragHref(null)
          setModDragFromCat(null)
          setModDropCat(null)
          setModDropIdx(-1)
        }

        const startEditCategory = (catId: string, currentName: string) => {
          setEditingModCat(catId)
          setEditingModItem(null)
          setModEditValue(currentName)
        }

        const confirmEditCategory = () => {
          if (!editingModCat || !modEditValue.trim()) {
            setEditingModCat(null)
            return
          }
          renameCategory(editingModCat, modEditValue.trim())
          setEditingModCat(null)
        }

        const startEditItem = (href: string) => {
          const item = resolveItem(href)
          if (!item) return
          setEditingModItem(href)
          setEditingModCat(null)
          setModEditValue(sidebarConfig.customNames[href] || item.label)
        }

        const confirmEditItem = () => {
          if (!editingModItem) return
          renameItem(editingModItem, modEditValue.trim())
          setEditingModItem(null)
        }

        const addCategory = () => {
          const config = getSidebarConfig()
          const id = `custom-${Date.now()}`
          setSidebarConfig({
            ...config,
            categories: [...config.categories, { id, name: 'New Category', items: [] }],
          })
          setEditingModCat(id)
          setModEditValue('New Category')
        }

        const deleteCategory = (catId: string) => {
          const config = getSidebarConfig()
          const cat = config.categories.find(c => c.id === catId)
          if (!cat || cat.items.length > 0) return
          setSidebarConfig({
            ...config,
            categories: config.categories.filter(c => c.id !== catId),
          })
        }

        const handleCreateModule = (catId?: string) => {
          const href = createCustomModule('New Module', catId)
          // Auto-start editing the new module name
          setTimeout(() => {
            setEditingModItem(href)
            setModEditValue('New Module')
          }, 50)
        }

        const handleDeleteModule = (href: string) => {
          softDeleteItem(href)
        }

        const dropIndicator = (
          <div style={{
            height: '2px',
            background: 'var(--accent)',
            borderRadius: '1px',
            margin: '0 8px',
            boxShadow: '0 0 6px var(--accent)',
          }} />
        )

        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{ flexShrink: 0 }}>
              <div style={sectionLabel}>Sidebar</div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                Drag to reorder. Double-click or right-click to rename. Move items between categories.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <button
                style={{ ...btnSecondary, padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={addCategory}
              >
                <Plus size={12} />
                Add Category
              </button>
              <button
                style={{ ...btnSecondary, padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => handleCreateModule()}
              >
                <FileText size={12} />
                Create Module
              </button>
              <button
                style={{ ...btnSecondary, padding: '6px 12px', fontSize: '11px', color: 'var(--text-muted)' }}
                onClick={() => {
                  resetSidebarConfig(); setEditingModItem(null); setEditingModCat(null)
                  // Also reset panel positions
                  localStorage.removeItem('panel-sb-modules')
                  localStorage.removeItem('panel-sb-unused')
                  localStorage.removeItem('panel-sb-customize')
                  window.location.reload()
                }}
              >
                Reset to Default
              </button>
              </div>
            </div>{/* end header */}

            <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Categories panel */}
            <ResizablePanel storageKey="sb-modules" title="Modules" panelId="modules" initialX={0} initialY={0} initialW={380} initialH={600} minW={250} minH={200} siblings={getSiblings('modules')} onRectChange={updatePanelRect('modules')} onSwap={handleSwap('modules')} forceRect={forceRects['modules']} swapTarget={swapHoverTarget === 'modules'} onSwapHover={setSwapHoverTarget}>
            <div
              onDragOver={e => {
                const data = modDragHref || ''
                if (data.startsWith('restore-category:')) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }
              }}
              onDrop={e => {
                const data = modDragHref || e.dataTransfer.getData('text/plain')
                if (data?.startsWith('restore-category:')) {
                  e.preventDefault()
                  const catId = data.slice('restore-category:'.length)
                  const cfg = getSidebarConfig()
                  const ucat = (cfg.unusedCategories || []).find(c => c.id === catId)
                  if (ucat) {
                    setSidebarConfig({
                      ...cfg,
                      categories: [...cfg.categories, ucat],
                      unusedCategories: (cfg.unusedCategories || []).filter(c => c.id !== catId),
                    })
                  }
                  setModDragHref(null)
                  setModDragFromCat(null)
                  setModDropCat(null)
                  setModDropIdx(-1)
                  setSwapHoverTarget(null)
                }
              }}
              style={{ minHeight: '100%' }}
            >
            {sidebarConfig.categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  marginBottom: '16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: modDropCat === cat.id && modDragHref ? 'rgba(155, 132, 236, 0.04)' : 'transparent',
                  transition: 'background 0.15s',
                  overflow: 'hidden',
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (cat.items.length === 0) {
                    setModDropCat(cat.id)
                    setModDropIdx(0)
                  }
                }}
                onDrop={cat.items.length === 0 ? handleModDrop(cat.id, 0) : undefined}
              >
                {/* Category header */}
                <div
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', `category:${cat.id}`)
                    e.dataTransfer.effectAllowed = 'move'
                    setModDragHref(`category:${cat.id}`)
                    setModDragFromCat(cat.id)
                  }}
                  onDragEnd={handleModDragEnd}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setSettingsCtxMenu({
                      x: e.clientX, y: e.clientY,
                      items: [
                        { label: 'Rename Category', icon: Pencil, onClick: () => startEditCategory(cat.id, cat.name) },
                        { label: 'Create Module Here', icon: FileText, onClick: () => handleCreateModule(cat.id) },
                        {
                          label: 'Move All to Unused',
                          icon: EyeOff,
                          onClick: () => {
                            const current = getEnabledModules()
                            const toDisable = cat.items
                              .map(href => resolveItem(href)?.moduleId)
                              .filter(Boolean) as string[]
                            setEnabledModules(current.filter(id => !toDisable.includes(id)))
                          },
                          disabled: cat.items.length === 0,
                        },
                        ...(cat.items.length === 0 ? [{ label: 'Delete Category', icon: Trash2, onClick: () => deleteCategory(cat.id), danger: true }] : []),
                      ],
                    })
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {editingModCat === cat.id ? (
                    <input
                      autoFocus
                      value={modEditValue}
                      onChange={e => setModEditValue(e.target.value)}
                      onBlur={confirmEditCategory}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmEditCategory()
                        if (e.key === 'Escape') setEditingModCat(null)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--accent)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        outline: 'none',
                        padding: '2px 0',
                        width: '200px',
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startEditCategory(cat.id, cat.name)}
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        cursor: 'text',
                        userSelect: 'none',
                      }}
                      title="Double-click or right-click to edit"
                    >
                      {cat.name}
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {cat.items.length}
                    </span>
                    {cat.items.length === 0 && (
                      <button
                        onClick={() => deleteCategory(cat.id)}
                        aria-label={`Delete ${cat.name} category`}
                        style={{
                          display: 'flex', alignItems: 'center', padding: '2px',
                          background: 'transparent', border: 'none', color: 'var(--text-muted)',
                          cursor: 'pointer', borderRadius: '4px',
                        }}
                        title="Delete empty category"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding: cat.items.length > 0 ? '4px 0' : '0' }}>
                  {cat.items.length === 0 && modDragHref && (
                    <div
                      style={{ padding: '12px', textAlign: 'center', color: 'var(--accent)', fontSize: '11px', fontWeight: 600 }}
                      onDragOver={(e) => { e.preventDefault(); setModDropCat(cat.id); setModDropIdx(0) }}
                      onDrop={handleModDrop(cat.id, 0)}
                    >
                      Drop here
                    </div>
                  )}
                  {cat.items.length === 0 && !modDragHref && (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                      Empty — drag items here or right-click to create
                    </div>
                  )}
                  {cat.items.map((href, idx) => {
                    const resolved = resolveItem(href)
                    if (!resolved) return null
                    const Icon = resolved.icon
                    const displayName = sidebarConfig.customNames[href] || resolved.label
                    const isEnabled = !resolved.moduleId || enabledModules.includes(resolved.moduleId)
                    if (!isEnabled) return null
                    const isDragTarget = modDropCat === cat.id && modDropIdx === idx && modDragHref !== href
                    const isDragTargetAfter = modDropCat === cat.id && modDropIdx === idx + 1 && idx === cat.items.length - 1 && modDragHref !== href
                    const isBeingDragged = modDragHref === href
                    const isCustom = href.startsWith('/custom/')
                    const originalName = resolved.label

                    return (
                      <div key={href}>
                        {isDragTarget && dropIndicator}
                        <div
                          draggable
                          onDragStart={handleModDragStart(href, cat.id)}
                          onDragEnd={handleModDragEnd}
                          onDragOver={handleModDragOver(cat.id, idx)}
                          onDrop={handleModDrop(cat.id, idx)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            const menuItems: { label: string; icon: React.ElementType; onClick: () => void; danger?: boolean; disabled?: boolean }[] = [
                              { label: 'Rename', icon: Pencil, onClick: () => startEditItem(href) },
                              { label: 'Move Up', icon: ArrowUp, onClick: () => moveItem(href, 'up'), disabled: idx === 0 },
                              { label: 'Move Down', icon: ArrowDown, onClick: () => moveItem(href, 'down'), disabled: idx === cat.items.length - 1 },
                            ]
                            menuItems.push({ label: 'Delete', icon: Trash2, onClick: () => handleDeleteModule(href), danger: true })
                            setSettingsCtxMenu({ x: e.clientX, y: e.clientY, items: menuItems })
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            opacity: isBeingDragged ? 0.3 : isEnabled ? 1 : 0.45,
                            transition: 'opacity 0.15s, background 0.1s',
                            cursor: 'grab',
                            borderRadius: '6px',
                            margin: '0 4px',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <GripVertical size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, cursor: 'grab' }} />
                          <Icon size={16} style={{ flexShrink: 0, color: isEnabled ? 'var(--text-secondary)' : 'var(--text-muted)' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {editingModItem === href ? (
                              <input
                                autoFocus
                                value={modEditValue}
                                onChange={e => setModEditValue(e.target.value)}
                                onBlur={confirmEditItem}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') confirmEditItem()
                                  if (e.key === 'Escape') setEditingModItem(null)
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  borderBottom: '1px solid var(--accent)',
                                  color: 'var(--text-primary)',
                                  fontSize: '13px',
                                  outline: 'none',
                                  padding: '1px 0',
                                  width: '100%',
                                  minWidth: 0,
                                  fontFamily: 'inherit',
                                }}
                              />
                            ) : (
                              <span
                                onDoubleClick={(e) => { e.stopPropagation(); startEditItem(href) }}
                                style={{
                                  fontSize: '13px',
                                  color: isEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
                                  cursor: 'text',
                                  userSelect: 'none',
                                }}
                                title="Double-click or right-click to edit"
                              >
                                {displayName}
                                {sidebarConfig.customNames[href] && !isCustom && (
                                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px', fontStyle: 'italic' }}>
                                    ({originalName})
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        {isDragTargetAfter && dropIndicator}
                      </div>
                    )
                  })}
                  {/* Drop zone at end of category */}
                  {cat.items.length > 0 && (
                    <div
                      style={{ height: '8px' }}
                      onDragOver={handleModDragOver(cat.id, cat.items.length)}
                      onDrop={handleModDrop(cat.id, cat.items.length)}
                    >
                      {modDropCat === cat.id && modDropIdx === cat.items.length && modDragHref && dropIndicator}
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>{/* end drop zone */}

            </ResizablePanel>

            {/* Unused Modules */}
            {(() => {
              const allCatHrefs = new Set(sidebarConfig.categories.flatMap(c => c.items))
              // Built-in modules that are disabled
              const disabledBuiltins = Array.from(allCatHrefs).filter(href => {
                const item = resolveItem(href)
                if (!item || !item.moduleId) return false
                return !enabledModules.includes(item.moduleId)
              })
              // Custom modules not in any category (orphaned)
              const orphanedCustom = (sidebarConfig.customModules || [])
                .map(m => `/custom/${m.id}`)
                .filter(href => !allCatHrefs.has(href) && !(sidebarConfig.deletedItems || []).some(d => d.href === href))
              const disabledItems = [...disabledBuiltins, ...orphanedCustom]
              return (
                <ResizablePanel storageKey="sb-unused" title={`Unused ${disabledItems.length || ''}`} panelId="unused" initialX={394} initialY={0} initialW={250} initialH={280} minW={160} minH={100} siblings={getSiblings('unused')} onRectChange={updatePanelRect('unused')} onSwap={handleSwap('unused')} forceRect={forceRects['unused']} swapTarget={swapHoverTarget === 'unused'} onSwapHover={setSwapHoverTarget}>
                <div
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setModDropCat('__unused__') }}
                  onDragLeave={() => { if (modDropCat === '__unused__') setModDropCat(null) }}
                  onDrop={e => {
                    e.preventDefault()
                    const href = modDragHref || e.dataTransfer.getData('text/plain')
                    if (!href) return

                    // Handle category drop — disable/delete all items in the category
                    if (href.startsWith('category:')) {
                      const catId = href.slice('category:'.length)
                      const cat = sidebarConfig.categories.find(c => c.id === catId)
                      if (cat) {
                        const cfg = getSidebarConfig()
                        setSidebarConfig({
                          ...cfg,
                          categories: cfg.categories.filter(c => c.id !== catId),
                          unusedCategories: [...(cfg.unusedCategories || []), cat],
                        })
                      }
                    } else {
                      const item = resolveItem(href)
                      if (item?.moduleId && enabledModules.includes(item.moduleId)) {
                        toggleModule(item.moduleId)
                      } else {
                        // Custom module — remove from category (orphan it)
                        const cfg = getSidebarConfig()
                        setSidebarConfig({
                          ...cfg,
                          categories: cfg.categories.map(c => ({
                            ...c,
                            items: c.items.filter(h => h !== href),
                          })),
                        })
                      }
                    }
                    setModDragHref(null)
                    setModDragFromCat(null)
                    setModDropCat(null)
                    setModDropIdx(-1)
                    setSwapHoverTarget(null)
                  }}
                  style={{
                    height: '100%',
                    background: modDropCat === '__unused__' ? 'rgba(155, 132, 236, 0.06)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {disabledItems.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                      {modDragHref ? 'Drop here to disable' : 'All modules active'}
                    </div>
                  ) : (
                    <div style={{ padding: '4px 0' }}>
                      {disabledItems.map(href => {
                        const item = resolveItem(href)
                        if (!item) return null
                        const Icon = item.icon
                        const displayName = sidebarConfig.customNames[href] || item.label
                        return (
                          <div
                            key={href}
                            draggable
                            onDragStart={handleModDragStart(href, '__unused__')}
                            onDragEnd={handleModDragEnd}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '7px 12px',
                              cursor: 'grab',
                              borderRadius: '6px',
                              margin: '0 4px',
                              opacity: 0.6,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
                          >
                            <Icon size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1 }}>{displayName}</span>
                            <button
                              onClick={() => {
                                if (item?.moduleId) {
                                  toggleModule(item.moduleId)
                                } else {
                                  // Custom module — add back to first category
                                  const cfg = getSidebarConfig()
                                  const first = cfg.categories[0]
                                  if (first) {
                                    setSidebarConfig({
                                      ...cfg,
                                      categories: cfg.categories.map(c =>
                                        c === first ? { ...c, items: [...c.items, href] } : c
                                      ),
                                    })
                                  }
                                }
                              }}
                              aria-label={`Enable ${displayName}`}
                              style={{
                                display: 'flex', alignItems: 'center', padding: '2px 6px',
                                background: 'transparent', border: '1px solid var(--border)',
                                borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer',
                                fontSize: '10px', fontWeight: 600,
                              }}
                            >
                              Enable
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {/* Unused categories */}
                  {(sidebarConfig.unusedCategories || []).map(ucat => (
                    <div
                      key={ucat.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('text/plain', `restore-category:${ucat.id}`)
                        e.dataTransfer.effectAllowed = 'move'
                        setModDragHref(`restore-category:${ucat.id}`)
                      }}
                      onDragEnd={handleModDragEnd}
                      style={{ margin: '4px', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', cursor: 'grab' }}
                    >
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', background: 'rgba(255,255,255,0.02)',
                        borderBottom: ucat.items.length > 0 ? '1px solid var(--border)' : 'none',
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                          {ucat.name}
                        </span>
                        <button
                          onClick={() => {
                            const cfg = getSidebarConfig()
                            setSidebarConfig({
                              ...cfg,
                              categories: [...cfg.categories, ucat],
                              unusedCategories: (cfg.unusedCategories || []).filter(c => c.id !== ucat.id),
                            })
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', padding: '2px 6px',
                            background: 'transparent', border: '1px solid var(--border)',
                            borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer',
                            fontSize: '9px', fontWeight: 600,
                          }}
                        >
                          Restore
                        </button>
                      </div>
                      {ucat.items.map(href => {
                        const item = resolveItem(href)
                        if (!item) return null
                        const Icon = item.icon
                        return (
                          <div key={href} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', opacity: 0.5 }}>
                            <Icon size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sidebarConfig.customNames[href] || item.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                </ResizablePanel>
              )
            })()}

            {/* Customize panel */}
            <ResizablePanel storageKey="sb-customize" title="Customize" panelId="customize" initialX={658} initialY={0} initialW={280} initialH={600} minW={200} minH={200} siblings={getSiblings('customize')} onRectChange={updatePanelRect('customize')} onSwap={handleSwap('customize')} forceRect={forceRects['customize']} swapTarget={swapHoverTarget === 'customize'} onSwapHover={setSwapHoverTarget}>
              <div style={{ padding: '8px 12px' }}>
                <div style={{ ...row, padding: '8px 0' }}>
                  <span style={{ fontSize: '12px' }}>Header</span>
                  <Toggle on={sidebarHeaderVisible} onToggle={v => setSidebarHeaderVisible(v)} label="Sidebar header" />
                </div>
                <div style={{ ...row, padding: '8px 0' }}>
                  <span style={{ fontSize: '12px' }}>Logo</span>
                  <Toggle on={sidebarLogoVisible} onToggle={v => setSidebarLogoVisible(v)} label="Sidebar logo" />
                </div>
                <div style={{ ...row, padding: '8px 0' }}>
                  <span style={{ fontSize: '12px' }}>Search bar</span>
                  <Toggle on={sidebarSearchVisible} onToggle={v => setSidebarSearchVisible(v)} label="Search bar" />
                </div>
                <div style={{ ...row, padding: '8px 0' }}>
                  <span style={{ fontSize: '12px' }}>Width</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="range"
                      min={100}
                      max={400}
                      defaultValue={sidebarDefaultWidth}
                      onInput={e => {
                        const label = (e.target as HTMLInputElement).nextElementSibling
                        if (label) label.textContent = (e.target as HTMLInputElement).value + 'px'
                      }}
                      onMouseUp={e => setSidebarDefaultWidth(Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={e => setSidebarDefaultWidth(Number((e.target as HTMLInputElement).value))}
                      aria-label="Default sidebar width"
                      style={{ width: '70px', accentColor: 'var(--accent)' }}
                    />
                    <span
                      onDoubleClick={e => {
                        const span = e.currentTarget
                        const current = sidebarDefaultWidth
                        const input = document.createElement('input')
                        input.type = 'text'
                        input.inputMode = 'numeric'
                        input.value = String(current)
                        Object.assign(input.style, {
                          width: '40px', background: 'transparent', border: 'none',
                          borderBottom: '1px solid var(--accent)', color: 'var(--text-primary)',
                          fontSize: '10px', fontFamily: 'monospace', textAlign: 'center',
                          outline: 'none', padding: '0',
                        })
                        span.textContent = ''
                        span.appendChild(input)
                        input.focus()
                        input.select()
                        const commit = () => {
                          const w = Math.max(100, Math.min(400, parseInt(input.value, 10) || 200))
                          setSidebarDefaultWidth(w)
                          span.textContent = w + 'px'
                        }
                        input.addEventListener('blur', commit)
                        input.addEventListener('keydown', ev => {
                          if (ev.key === 'Enter') input.blur()
                          if (ev.key === 'Escape') { span.textContent = current + 'px' }
                        })
                      }}
                      style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', cursor: 'text', userSelect: 'none' }}
                    >
                      {sidebarDefaultWidth}px
                    </span>
                  </div>
                </div>
                <div style={{ ...row, padding: '8px 0' }}>
                  <span style={{ fontSize: '12px' }}>Title</span>
                  {!editingTitle ? (
                    <span
                      onDoubleClick={() => {
                        titleBeforeEdit.current = sidebarTitleText
                        titleSaved.current = false
                        setTitleDraft(sidebarTitleText)
                        setEditingTitle(true)
                      }}
                      style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', cursor: 'text', userSelect: 'none' }}
                    >
                      {sidebarTitleText || 'OPENCLAW'}
                    </span>
                  ) : (
                    <input
                      autoFocus
                      defaultValue={sidebarTitleText}
                      onBlur={e => {
                        const v = e.currentTarget.value.trim()
                        if (v) setSidebarTitleText(v)
                        setEditingTitle(false)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) setSidebarTitleText(v); setEditingTitle(false) }
                        if (e.key === 'Escape') { setSidebarTitleText(titleBeforeEdit.current); setEditingTitle(false) }
                      }}
                      style={{
                        width: '90px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                        borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)',
                        fontSize: '11px', fontFamily: 'monospace', textAlign: 'right', outline: 'none',
                      }}
                    />
                  )}
                </div>
                <div style={{ ...row, padding: '8px 0' }}>
                  <span style={{ fontSize: '12px' }}>Font size</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="range"
                      min={10}
                      max={40}
                      defaultValue={sidebarTitleSize}
                      onInput={e => {
                        const v = Number((e.target as HTMLInputElement).value)
                        setSidebarTitleSize(v)
                        const label = (e.target as HTMLInputElement).nextElementSibling
                        if (label) label.textContent = v + 'px'
                      }}
                      aria-label="Title font size"
                      style={{ width: '60px', accentColor: 'var(--accent)' }}
                    />
                    <span
                      onDoubleClick={e => {
                        const span = e.currentTarget
                        const current = sidebarTitleSize
                        const input = document.createElement('input')
                        input.type = 'text'
                        input.inputMode = 'numeric'
                        input.value = String(current)
                        Object.assign(input.style, {
                          width: '40px', background: 'transparent', border: 'none',
                          borderBottom: '1px solid var(--accent)', color: 'var(--text-primary)',
                          fontSize: '10px', fontFamily: 'monospace', textAlign: 'center',
                          outline: 'none', padding: '0',
                        })
                        span.textContent = ''
                        span.appendChild(input)
                        input.focus()
                        input.select()
                        const commit = () => {
                          const v = Math.max(10, Math.min(40, parseInt(input.value, 10) || 22))
                          setSidebarTitleSize(v)
                          span.textContent = v + 'px'
                        }
                        input.addEventListener('blur', commit)
                        input.addEventListener('keydown', ev => {
                          if (ev.key === 'Enter') input.blur()
                          if (ev.key === 'Escape') { span.textContent = current + 'px' }
                        })
                      }}
                      style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', cursor: 'text', userSelect: 'none' }}
                    >
                      {sidebarTitleSize}px
                    </span>
                  </div>
                </div>
                <div style={{ ...row, padding: '8px 0', borderBottom: 'none' }}>
                  <span style={{ fontSize: '12px' }}>Layout</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['one-line', 'two-line'] as const).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setSidebarTitleLayout(opt)}
                        style={{
                          padding: '3px 8px', fontSize: '10px',
                          fontWeight: sidebarTitleLayout === opt ? 600 : 450,
                          color: sidebarTitleLayout === opt ? '#fff' : 'var(--text-secondary)',
                          background: sidebarTitleLayout === opt ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                          border: `1px solid ${sidebarTitleLayout === opt ? 'var(--border-accent)' : 'var(--border)'}`,
                          borderRadius: '6px', cursor: 'pointer',
                        }}
                      >
                        {opt === 'one-line' ? '1 line' : '2 lines'}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ ...row, padding: '8px 0' }}>
                  <span style={{ fontSize: '12px' }}>Title bar</span>
                  <Toggle on={titleBarVisible} onToggle={v => toggleTitleBar(v)} label="Window title bar" />
                </div>
                <div style={{ ...row, padding: '8px 0', borderBottom: 'none' }}>
                  <span style={{ fontSize: '12px' }}>Auto-hide</span>
                  <Toggle on={titleBarAutoHide} onToggle={v => setTitleBarAutoHide(v)} label="Auto-hide title bar" />
                </div>
              </div>
            </ResizablePanel>

            {/* Recycle Bin panel */}
            {(() => {
              const deleted = sidebarConfig.deletedItems || []
              return (
                <ResizablePanel storageKey="sb-recycle" title={`Recycle Bin ${deleted.length}`} panelId="recycle" initialX={394} initialY={294} initialW={250} initialH={306} minW={160} minH={100} siblings={getSiblings('recycle')} onRectChange={updatePanelRect('recycle')} onSwap={handleSwap('recycle')} forceRect={forceRects['recycle']} swapTarget={swapHoverTarget === 'recycle'} onSwapHover={setSwapHoverTarget}>
                  <div style={{ padding: '4px 0' }}>
                    {deleted.length === 0 && (
                      <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                        Recycle bin is empty
                      </div>
                    )}
                    {deleted.map(d => {
                      const item = resolveItem(d.href)
                      const Icon = item?.icon || FileText
                      const name = sidebarConfig.customNames[d.href] || item?.label || d.href
                      return (
                        <div key={d.href} style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px',
                          borderRadius: '6px', margin: '0 4px', opacity: 0.6,
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
                        >
                          <Icon size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1 }}>{name}</span>
                          <button
                            onClick={() => restoreItem(d.href)}
                            style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => permanentlyDelete(d.href)}
                            style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', background: 'transparent', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '4px', color: '#f87171', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                          >
                            Delete
                          </button>
                        </div>
                      )
                    })}
                    {deleted.length > 0 && (
                      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', marginTop: '4px' }}>
                        <button
                          onClick={emptyRecycleBin}
                          style={{ ...btnSecondary, padding: '4px 10px', fontSize: '10px', color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                        >
                          Empty Recycle Bin
                        </button>
                      </div>
                    )}
                  </div>
                </ResizablePanel>
              )
            })()}

            {/* Combined resize handle — one panel left, multiple right */}
            {(() => {
              const ids = Object.keys(panelRects)
              const gap = GAP_BETWEEN_PANELS
              const combinedHandles: React.ReactNode[] = []

              // For each panel, find all panels adjacent to its right edge
              for (const leftId of ids) {
                const left = panelRects[leftId]
                if (!left) continue
                const leftRight = left.x + left.w
                const rightNeighbors = ids.filter(id => {
                  if (id === leftId) return false
                  const r = panelRects[id]
                  if (!r) return false
                  return r.x > leftRight && r.x - leftRight <= gap * 2
                })
                if (rightNeighbors.length < 2) continue // only create combined handle for 2+ neighbors

                // Compute the full vertical span
                const allRects = rightNeighbors.map(id => panelRects[id])
                const minY = Math.min(left.y, ...allRects.map(r => r.y))
                const maxY = Math.max(left.y + left.h, ...allRects.map(r => r.y + r.h))
                const handleX = leftRight
                const handleGap = (allRects[0]?.x || leftRight + gap) - leftRight

                combinedHandles.push(
                  <div
                    key={`combined-${leftId}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      const startX = e.clientX
                      const origLeftW = left.w
                      const origRights = rightNeighbors.map(id => ({ id, ...panelRects[id] }))
                      const onMove = (ev: MouseEvent) => {
                        const dx = ev.clientX - startX
                        const newLeftW = Math.max(150, origLeftW + dx)
                        const actualDx = newLeftW - origLeftW
                        // Check if any right panel would be too small
                        const allValid = origRights.every(r => r.w - actualDx >= 150)
                        if (!allValid) return
                        const rev = Date.now() % 100000
                        const rects: Record<string, PanelRect & { _rev: number }> = {
                          [leftId]: { ...left, w: newLeftW, _rev: rev },
                        }
                        for (const r of origRights) {
                          rects[r.id] = { x: r.x + actualDx, y: r.y, w: r.w - actualDx, h: r.h, _rev: rev }
                        }
                        setForceRects(rects)
                      }
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                        document.body.style.cursor = ''
                        document.body.style.userSelect = ''
                      }
                      document.body.style.cursor = 'col-resize'
                      document.body.style.userSelect = 'none'
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                    onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                    style={{
                      position: 'absolute',
                      left: handleX,
                      top: minY,
                      width: handleGap,
                      height: maxY - minY,
                      cursor: 'col-resize',
                      zIndex: 99999,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: '1.5px', marginLeft: '-0.75px',
                      background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                    }} />
                  </div>,
                )
              }
              // Also check right-to-left: one panel on right, multiple on left
              for (const rightId of ids) {
                const right = panelRects[rightId]
                if (!right) continue
                const rightLeft = right.x
                const leftNeighbors = ids.filter(id => {
                  if (id === rightId) return false
                  const l = panelRects[id]
                  if (!l) return false
                  const lRight = l.x + l.w
                  return lRight < rightLeft && rightLeft - lRight <= gap * 2
                })
                if (leftNeighbors.length < 2) continue

                const allRects = leftNeighbors.map(id => panelRects[id])
                const minY = Math.min(right.y, ...allRects.map(r => r.y))
                const maxY = Math.max(right.y + right.h, ...allRects.map(r => r.y + r.h))
                const handleGap = rightLeft - Math.max(...allRects.map(r => r.x + r.w))
                const handleX = rightLeft - handleGap

                combinedHandles.push(
                  <div
                    key={`combined-r-${rightId}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      const startX = e.clientX
                      const origRightX = right.x, origRightW = right.w
                      const origLefts = leftNeighbors.map(id => ({ id, ...panelRects[id] }))
                      const onMove = (ev: MouseEvent) => {
                        const dx = ev.clientX - startX
                        const newRightX = origRightX + dx
                        const newRightW = Math.max(150, origRightW - dx)
                        if (newRightW < 150) return
                        const allValid = origLefts.every(l => l.w + dx >= 150)
                        if (!allValid) return
                        const rev = Date.now() % 100000
                        const rects: Record<string, PanelRect & { _rev: number }> = {
                          [rightId]: { x: newRightX, y: right.y, w: newRightW, h: right.h, _rev: rev },
                        }
                        for (const l of origLefts) {
                          rects[l.id] = { x: l.x, y: l.y, w: l.w + dx, h: l.h, _rev: rev }
                        }
                        setForceRects(rects)
                      }
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                        document.body.style.cursor = ''
                        document.body.style.userSelect = ''
                      }
                      document.body.style.cursor = 'col-resize'
                      document.body.style.userSelect = 'none'
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                    onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                    style={{
                      position: 'absolute',
                      left: handleX,
                      top: minY,
                      width: handleGap,
                      height: maxY - minY,
                      cursor: 'col-resize',
                      zIndex: 99999,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: '1.5px', marginLeft: '-0.75px',
                      background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                    }} />
                  </div>,
                )
              }

              // Track which panel IDs are covered by combined handles
              const coveredPairs = new Set<string>()
              for (const leftId of ids) {
                const left = panelRects[leftId]
                if (!left) continue
                const leftRight = left.x + left.w
                const rn = ids.filter(id => {
                  if (id === leftId) return false
                  const r = panelRects[id]
                  return r && r.x > leftRight && r.x - leftRight <= gap * 2
                })
                if (rn.length >= 2) rn.forEach(id => { coveredPairs.add(`${leftId}-${id}`); coveredPairs.add(`${id}-${leftId}`) })
              }
              for (const rightId of ids) {
                const right = panelRects[rightId]
                if (!right) continue
                const ln = ids.filter(id => {
                  if (id === rightId) return false
                  const l = panelRects[id]
                  return l && l.x + l.w < right.x && right.x - (l.x + l.w) <= gap * 2
                })
                if (ln.length >= 2) ln.forEach(id => { coveredPairs.add(`${rightId}-${id}`); coveredPairs.add(`${id}-${rightId}`) })
              }

              return combinedHandles
            })()}

            {/* Shared resize handles between adjacent panels (skip pairs covered by combined) */}
            {(() => {
              const ids = Object.keys(panelRects)
              const gap = GAP_BETWEEN_PANELS
              // Rebuild coveredPairs
              const coveredPairs = new Set<string>()
              for (const leftId of ids) {
                const left = panelRects[leftId]
                if (!left) continue
                const leftRight = left.x + left.w
                const rn = ids.filter(id => { const r = panelRects[id]; return id !== leftId && r && r.x > leftRight && r.x - leftRight <= gap * 2 })
                if (rn.length >= 2) rn.forEach(id => { coveredPairs.add(`${leftId}-${id}`); coveredPairs.add(`${id}-${leftId}`) })
              }
              for (const rightId of ids) {
                const right = panelRects[rightId]
                if (!right) continue
                const ln = ids.filter(id => { const l = panelRects[id]; return id !== rightId && l && l.x + l.w < right.x && right.x - (l.x + l.w) <= gap * 2 })
                if (ln.length >= 2) ln.forEach(id => { coveredPairs.add(`${rightId}-${id}`); coveredPairs.add(`${id}-${rightId}`) })
              }

              const handles: React.ReactNode[] = []
              for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                  const a = panelRects[ids[i]], b = panelRects[ids[j]]
                  if (!a || !b) continue
                  // Check horizontal adjacency (a right edge near b left edge)
                  const gap = GAP_BETWEEN_PANELS
                  const aRight = a.x + a.w, bLeft = b.x
                  const bRight = b.x + b.w, aLeft = a.x
                  // Vertical overlap check
                  const vOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
                  if (vOverlap > 20) {
                    // a is left of b
                    if (bLeft > aRight && bLeft - aRight <= gap * 2) {
                      const top = Math.max(a.y, b.y)
                      const bottom = Math.min(a.y + a.h, b.y + b.h)
                      const leftId = ids[i], rightId = ids[j]
                      handles.push(
                        <div
                          key={`h-${leftId}-${rightId}`}
                          onMouseDown={e => {
                            e.preventDefault()
                            const startX = e.clientX
                            const origAW = a.w, origBX = b.x, origBW = b.w
                            const onMove = (ev: MouseEvent) => {
                              const dx = ev.clientX - startX
                              const newAW = Math.max(150, origAW + dx)
                              const newBX = origBX + (newAW - origAW)
                              const newBW = Math.max(150, origBW - (newAW - origAW))
                              const newLeftRect = { ...a, w: newAW }
                              const newRightRect = { ...b, x: newBX, w: newBW }
                              if (newAW >= 150 && newBW >= 150 &&
                                  !wouldOverlapOthers(newLeftRect, [leftId, rightId]) &&
                                  !wouldOverlapOthers(newRightRect, [leftId, rightId])) {
                                const rev = Date.now() % 100000
                                setForceRects({
                                  [leftId]: { ...newLeftRect, _rev: rev },
                                  [rightId]: { ...newRightRect, _rev: rev },
                                })
                              }
                            }
                            const onUp = () => {
                              document.removeEventListener('mousemove', onMove)
                              document.removeEventListener('mouseup', onUp)
                              document.body.style.cursor = ''
                              document.body.style.userSelect = ''
                            }
                            document.body.style.cursor = 'col-resize'
                            document.body.style.userSelect = 'none'
                            document.addEventListener('mousemove', onMove)
                            document.addEventListener('mouseup', onUp)
                          }}
                          onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                          onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                          style={{
                            position: 'absolute',
                            left: aRight,
                            top,
                            width: gap,
                            height: bottom - top,
                            cursor: 'col-resize',
                            zIndex: 99999,
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: '1.5px', marginLeft: '-0.75px',
                            background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                          }} />
                        </div>,
                      )
                    }
                    // b is left of a
                    if (aLeft > bRight && aLeft - bRight <= gap * 2) {
                      const top = Math.max(a.y, b.y)
                      const bottom = Math.min(a.y + a.h, b.y + b.h)
                      const leftId = ids[j], rightId = ids[i]
                      handles.push(
                        <div
                          key={`h-${leftId}-${rightId}`}
                          onMouseDown={e => {
                            e.preventDefault()
                            const startX = e.clientX
                            const origBW2 = b.w, origAX2 = a.x, origAW2 = a.w
                            const onMove = (ev: MouseEvent) => {
                              const dx = ev.clientX - startX
                              const newBW = Math.max(150, origBW2 + dx)
                              const newAX = origAX2 + (newBW - origBW2)
                              const newAW = Math.max(150, origAW2 - (newBW - origBW2))
                              const newLeftRect = { ...b, w: newBW }
                              const newRightRect = { ...a, x: newAX, w: newAW }
                              if (newBW >= 150 && newAW >= 150 &&
                                  !wouldOverlapOthers(newLeftRect, [leftId, rightId]) &&
                                  !wouldOverlapOthers(newRightRect, [leftId, rightId])) {
                                const rev = Date.now() % 100000
                                setForceRects({
                                  [leftId]: { ...newLeftRect, _rev: rev },
                                  [rightId]: { ...newRightRect, _rev: rev },
                                })
                              }
                            }
                            const onUp = () => {
                              document.removeEventListener('mousemove', onMove)
                              document.removeEventListener('mouseup', onUp)
                              document.body.style.cursor = ''
                              document.body.style.userSelect = ''
                            }
                            document.body.style.cursor = 'col-resize'
                            document.body.style.userSelect = 'none'
                            document.addEventListener('mousemove', onMove)
                            document.addEventListener('mouseup', onUp)
                          }}
                          onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                          onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                          style={{
                            position: 'absolute',
                            left: bRight,
                            top,
                            width: gap,
                            height: bottom - top,
                            cursor: 'col-resize',
                            zIndex: 99999,
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: '1.5px', marginLeft: '-0.75px',
                            background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                          }} />
                        </div>,
                      )
                    }
                  }
                }
              }
              // Check vertical adjacency (top/bottom)
              for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                  const a = panelRects[ids[i]], b = panelRects[ids[j]]
                  if (!a || !b) continue
                  const gap = GAP_BETWEEN_PANELS
                  const aBottom = a.y + a.h, bTop = b.y
                  const bBottom = b.y + b.h, aTop = a.y
                  const hOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
                  if (hOverlap > 20) {
                    // a is above b
                    if (bTop > aBottom && bTop - aBottom <= gap * 2) {
                      const left = Math.max(a.x, b.x)
                      const right = Math.min(a.x + a.w, b.x + b.w)
                      const topId = ids[i], bottomId = ids[j]
                      handles.push(
                        <div
                          key={`v-${topId}-${bottomId}`}
                          onMouseDown={e => {
                            e.preventDefault()
                            const startY = e.clientY
                            const origAH = a.h, origBY = b.y, origBH = b.h
                            const onMove = (ev: MouseEvent) => {
                              const dy = ev.clientY - startY
                              const newAH = Math.max(100, origAH + dy)
                              const newBY = origBY + (newAH - origAH)
                              const newBH = Math.max(100, origBH - (newAH - origAH))
                              const newTopRect = { ...a, h: newAH }
                              const newBottomRect = { ...b, y: newBY, h: newBH }
                              if (newAH >= 100 && newBH >= 100 &&
                                  !wouldOverlapOthers(newTopRect, [topId, bottomId]) &&
                                  !wouldOverlapOthers(newBottomRect, [topId, bottomId])) {
                                const rev = Date.now() % 100000
                                setForceRects({
                                  [topId]: { ...newTopRect, _rev: rev },
                                  [bottomId]: { ...newBottomRect, _rev: rev },
                                })
                              }
                            }
                            const onUp = () => {
                              document.removeEventListener('mousemove', onMove)
                              document.removeEventListener('mouseup', onUp)
                              document.body.style.cursor = ''
                              document.body.style.userSelect = ''
                            }
                            document.body.style.cursor = 'row-resize'
                            document.body.style.userSelect = 'none'
                            document.addEventListener('mousemove', onMove)
                            document.addEventListener('mouseup', onUp)
                          }}
                          onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                          onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                          style={{
                            position: 'absolute',
                            left,
                            top: aBottom,
                            width: right - left,
                            height: bTop - aBottom,
                            cursor: 'row-resize',
                            zIndex: 99999,
                          }}
                        >
                          <div style={{
                            position: 'absolute', left: '10%', right: '10%', top: '50%', height: '1.5px', marginTop: '-0.75px',
                            background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                          }} />
                        </div>,
                      )
                    }
                    // b is above a
                    if (aTop > bBottom && aTop - bBottom <= gap * 2) {
                      const left = Math.max(a.x, b.x)
                      const right = Math.min(a.x + a.w, b.x + b.w)
                      const topId = ids[j], bottomId = ids[i]
                      handles.push(
                        <div
                          key={`v-${topId}-${bottomId}`}
                          onMouseDown={e => {
                            e.preventDefault()
                            const startY = e.clientY
                            const origBH = b.h, origAY = a.y, origAH = a.h
                            const onMove = (ev: MouseEvent) => {
                              const dy = ev.clientY - startY
                              const newBH = Math.max(100, origBH + dy)
                              const newAY = origAY + (newBH - origBH)
                              const newAH = Math.max(100, origAH - (newBH - origBH))
                              const newTopRect = { ...b, h: newBH }
                              const newBottomRect = { ...a, y: newAY, h: newAH }
                              if (newBH >= 100 && newAH >= 100 &&
                                  !wouldOverlapOthers(newTopRect, [topId, bottomId]) &&
                                  !wouldOverlapOthers(newBottomRect, [topId, bottomId])) {
                                const rev = Date.now() % 100000
                                setForceRects({
                                  [topId]: { ...newTopRect, _rev: rev },
                                  [bottomId]: { ...newBottomRect, _rev: rev },
                                })
                              }
                            }
                            const onUp = () => {
                              document.removeEventListener('mousemove', onMove)
                              document.removeEventListener('mouseup', onUp)
                              document.body.style.cursor = ''
                              document.body.style.userSelect = ''
                            }
                            document.body.style.cursor = 'row-resize'
                            document.body.style.userSelect = 'none'
                            document.addEventListener('mousemove', onMove)
                            document.addEventListener('mouseup', onUp)
                          }}
                          onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1' }}
                          onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0' }}
                          style={{
                            position: 'absolute',
                            left,
                            top: bBottom,
                            width: right - left,
                            height: aTop - bBottom,
                            cursor: 'row-resize',
                            zIndex: 99999,
                          }}
                        >
                          <div style={{
                            position: 'absolute', left: '10%', right: '10%', top: '50%', height: '1.5px', marginTop: '-0.75px',
                            background: 'var(--accent)', borderRadius: '1px', opacity: 0, transition: 'opacity 0.15s',
                          }} />
                        </div>,
                      )
                    }
                  }
                }
              }

              return handles
            })()}

            </div>{/* end scratchpad */}

            {/* Context menu for settings modules */}
            {settingsCtxMenu && <ContextMenu {...settingsCtxMenu} onClose={() => setSettingsCtxMenu(null)} />}
          </div>
        )
      }
      case 'notifications':
        return (
          <div>
            <div style={sectionLabel}>Notification Preferences</div>
            <div style={row}>
              <div>
                <span>Do Not Disturb</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Silence all notifications</div>
              </div>
              <Toggle on={dndEnabled} onToggle={v => { setDndEnabled(v) }} label="Do Not Disturb" />
            </div>
            <div style={row}>
              <div>
                <span>System notifications</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>OS-level alerts for new messages</div>
              </div>
              <Toggle on={systemNotifs} onToggle={v => { setSystemNotifs(v) }} label="System notifications" />
            </div>
            <div style={row}>
              <div>
                <span>In-app notifications</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Toast banners within the app</div>
              </div>
              <Toggle on={inAppNotifs} onToggle={v => { setInAppNotifs(v) }} label="In-app notifications" />
            </div>
            <div style={row}>
              <div>
                <span>Notification sound</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Play chime on new messages</div>
              </div>
              <Toggle on={notifSound} onToggle={v => { setNotifSound(v) }} label="Notification sound" />
            </div>

            <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                style={btnSecondary}
                onClick={async () => {
                  if (dndEnabled) {
                    // DND on — show confirmation that nothing fired
                    const el = document.createElement('div')
                    el.textContent = 'DND active — all notifications silenced'
                    Object.assign(el.style, {
                      position: 'fixed', top: '16px', right: '16px', zIndex: '10000',
                      padding: '12px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: '600',
                      background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)',
                      color: '#f87171', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      animation: 'fadeInUp 0.3s ease',
                    })
                    document.body.appendChild(el)
                    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300) }, 2000)
                    return
                  }
                  // Chime
                  if (notifSound) {
                    try {
                      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
                      if (ctx.state === 'suspended') await ctx.resume()
                      const osc = ctx.createOscillator()
                      const gain = ctx.createGain()
                      osc.connect(gain); gain.connect(ctx.destination)
                      osc.type = 'sine'
                      osc.frequency.setValueAtTime(880, ctx.currentTime)
                      osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.08)
                      osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.16)
                      gain.gain.setValueAtTime(0.25, ctx.currentTime)
                      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
                      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35)
                      osc.onended = () => ctx.close()
                    } catch { /* */ }
                  }
                  // System
                  if (systemNotifs && typeof Notification !== 'undefined') {
                    if (Notification.permission === 'default') await Notification.requestPermission()
                    if (Notification.permission === 'granted') {
                      new Notification('Mission Control', { body: 'This is a test notification', tag: 'mc-test-' + Date.now() })
                    }
                  }
                  // In-app (just a brief visual confirmation here since we're not on Messages page)
                  if (inAppNotifs) {
                    const el = document.createElement('div')
                    el.textContent = 'Test in-app notification'
                    Object.assign(el.style, {
                      position: 'fixed', top: '16px', right: '16px', zIndex: '10000',
                      padding: '12px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: '600',
                      background: 'rgba(18,18,24,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#e4e4ec', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      animation: 'fadeInUp 0.3s ease',
                    })
                    document.body.appendChild(el)
                    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300) }, 3000)
                  }
                  if (!notifSound && !systemNotifs && !inAppNotifs) {
                    alert('All notification types are disabled.')
                  }
                }}
              >
                Send test notification
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {dndEnabled ? 'DND is on — test will verify silence' :
                  [notifSound && 'sound', systemNotifs && 'system', inAppNotifs && 'in-app'].filter(Boolean).join(' + ') || 'All disabled'}
              </span>
            </div>

            <div style={{ ...sectionLabel, marginTop: '24px' }}>Push Notifications (ntfy.sh)</div>
            <div style={row}>
              <span>NTFY URL</span>
              <input style={inputStyle} value={ntfyUrl} onChange={e => setNtfyUrl(e.target.value)} placeholder="http://localhost:2586" aria-label="NTFY URL" />
            </div>
            <div style={row}>
              <span>Topic</span>
              <input style={inputStyle} value={ntfyTopic} onChange={e => setNtfyTopic(e.target.value)} placeholder="mission-control" aria-label="NTFY topic" />
            </div>
            <div style={{ ...rowLast, flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={btnSecondary} onClick={testNtfy} disabled={ntfyTesting}>
                  {ntfyTesting ? 'Sending...' : 'Test'}
                </button>
                <button style={btnStyle} onClick={() => { setNtfyStatus(null); saveNtfyMutation.mutate() }} disabled={saveNtfyMutation.isPending}>
                  {saveNtfyMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
              {ntfyStatus && (
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: ntfyStatus.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                  {ntfyStatus}
                </span>
              )}
            </div>
          </div>
        )
      case 'privacy':
        return (
          <div>
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
            <div style={rowLast}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, padding: '4px 0' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>What is collected:</strong> error message, stack trace (truncated), app version, platform, page route, timestamp.
                <br />
                <strong style={{ color: 'var(--text-secondary)' }}>Never collected:</strong> message content, contact names, API keys, URLs, or IP addresses.
              </div>
            </div>
          </div>
        )
      case 'data':
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
                        for (const [key, value] of Object.entries(parsed)) {
                          if (typeof value === 'string') {
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
      case 'status':
        return <StatusSection />
      default:
        return null
    }
  }

  // Group sections
  const groups = SECTION_GROUPS

  return (
    <div style={{ display: 'flex', position: 'absolute', inset: 0, gap: '0', overflow: 'hidden' }}>
      {/* Left panel — settings categories */}
      <div style={{
        width: selected ? '280px' : '100%',
        maxWidth: selected ? '280px' : undefined,
        minWidth: selected ? '280px' : undefined,
        borderRight: selected ? '1px solid var(--border)' : 'none',
        display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
        transition: 'width 0.25s var(--ease-spring)',
      }}>
        <div style={{
          padding: '0 20px', height: '57px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
        }}>
          <Settings size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Settings</h1>
        </div>

        <div
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setFocusedSectionIndex(prev => Math.min(prev + 1, SECTIONS.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setFocusedSectionIndex(prev => Math.max(prev - 1, 0))
            } else if (e.key === 'Enter' && focusedSectionIndex >= 0 && focusedSectionIndex < SECTIONS.length) {
              e.preventDefault()
              setSelected(SECTIONS[focusedSectionIndex].key)
            } else if (e.key === 'Escape' && selected) {
              e.preventDefault()
              setSelected(null)
              setFocusedSectionIndex(-1)
            }
          }}
          style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', outline: 'none' }}
        >
          {groups.map(group => (
            <div key={group}>
              <div style={{
                fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '8px 12px 4px', whiteSpace: 'nowrap',
              }}>
                {group}
              </div>
              {SECTIONS.filter(s => s.group === group).map(s => {
                const active = selected === s.key
                const flatIdx = SECTIONS.indexOf(s)
                const isFocused = focusedSectionIndex === flatIdx
                return (
                  <button
                    key={s.key}
                    onClick={() => setSelected(s.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                      padding: '8px 16px', borderRadius: '10px', marginBottom: '2px',
                      background: active ? 'var(--active-bg)' : isFocused ? 'rgba(167,139,250,0.10)' : 'transparent',
                      border: 'none', color: active ? '#fff' : 'var(--text-secondary)',
                      fontSize: '13px', fontWeight: active ? 600 : 450, cursor: 'pointer',
                      textAlign: 'left', whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                      outline: isFocused ? '1px solid rgba(167,139,250,0.4)' : 'none',
                      outlineOffset: '-1px',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = isFocused ? 'rgba(167,139,250,0.10)' : 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                    onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--active-bg)' : isFocused ? 'rgba(167,139,250,0.10)' : 'transparent'; e.currentTarget.style.color = active ? '#fff' : 'var(--text-secondary)' }}
                  >
                    <s.icon size={16} style={{ flexShrink: 0, color: active ? 'var(--accent)' : undefined }} />
                    {s.label}
                    {!selected && <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — detail */}
      {selected && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            padding: '0 20px', height: '57px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
          }}>
            <button
              onClick={() => setSelected(null)}
              aria-label="Back to settings"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px' }}
            >
              <ArrowLeft size={18} />
            </button>
            {(() => {
              const s = SECTIONS.find(s => s.key === selected)
              return s ? (
                <>
                  <s.icon size={18} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '16px', fontWeight: 600 }}>{s.label}</span>
                </>
              ) : null
            })()}
          </div>
          <div style={{
            flex: 1,
            overflowY: selected === 'modules' ? 'hidden' : 'auto',
            padding: '20px 28px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            <div style={{
              ...(selected === 'modules' ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : { maxWidth: '600px' }),
            }}>
              {renderDetail()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
