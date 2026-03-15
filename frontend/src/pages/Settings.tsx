
import { Settings, Bell, Palette, User, Server, Cpu, Zap, ChevronRight, ArrowLeft, Keyboard, Database, Blocks, Plug, Download, EyeOff, FolderOpen, FileText, HeartPulse, Wifi, Info, RefreshCw, Clock, HardDrive, Layers, Monitor } from 'lucide-react'
import { useState, useEffect, memo, useCallback, lazy, Suspense } from 'react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { DEFAULT_ACCENT, DEFAULT_GLOW, DEFAULT_SECONDARY, DEFAULT_LOGO, applyAccentColor, applyGlowColor, applySecondaryColor, applyLogoColor } from '@/lib/themes'
import { row, rowLast, val, inputStyle, btnStyle, btnSecondary, sectionLabel } from './settings/shared'

// ── Lazy-loaded section components ──────────────────────────────────────────
const SettingsUser = lazy(() => import('./settings/SettingsUser'))
const SettingsConnections = lazy(() => import('./settings/SettingsConnections'))
const SettingsDisplay = lazy(() => import('./settings/SettingsDisplay'))
const SettingsKeybindings = lazy(() => import('./settings/SettingsKeybindings'))
const SettingsModules = lazy(() => import('./settings/SettingsModules'))
const SettingsNotifications = lazy(() => import('./settings/SettingsNotifications'))
const SettingsPrivacy = lazy(() => import('./settings/SettingsPrivacy'))
const SettingsData = lazy(() => import('./settings/SettingsData'))

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
    case 'ok': return 'var(--green-500)'
    case 'error': case 'degraded': return 'var(--yellow)'
    case 'unreachable': return 'var(--red-500)'
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
  background: online ? 'var(--green-500)' : 'var(--red-500)',
  boxShadow: online ? '0 0 6px rgba(34,197,94,0.4)' : '0 0 6px rgba(239,68,68,0.4)',
  flexShrink: 0,
})

function StatusStatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg-white-03)',
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
                      color: peer.online ? 'var(--green-500)' : 'var(--red-500)',
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
            <StatusStatCard label="Stale Queries" value={staleQueries.length} accent={staleQueries.length > 0 ? 'var(--yellow)' : undefined} />
            <StatusStatCard label="Active Fetches" value={allQueries.filter(q => q.state.fetchStatus === 'fetching').length} accent="var(--green-500)" />
          </div>
        </div>
      </div>
    </div>
  )
})

// ── Loading fallback for lazy sections ──────────────────────────────────────
function SectionFallback() {
  return (
    <div style={{ padding: '20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: '16px', height: '16px', borderRadius: '50%',
        border: '2px solid var(--border)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.6s linear infinite',
      }} />
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</span>
    </div>
  )
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams()
  const setupMfaRequired = searchParams.get('setup_mfa') === '1'
  const initialSection = searchParams.get('section') as SettingsSection | null
  const [selected, setSelected] = useState<SettingsSection | null>(initialSection)
  const [focusedSectionIndex, setFocusedSectionIndex] = useState(-1)
  const [userName, setUserName] = useLocalStorageState('user-name', 'User')
  const [userAvatar, setUserAvatar] = useLocalStorageState('user-avatar', '🦍')

  // Theme & color state — kept here because display section needs it
  const [theme, setThemeState] = useLocalStorageState<'dark' | 'light' | 'system'>('theme', 'dark')
  const [accentColor, setAccentColor] = useLocalStorageState('accent-color', DEFAULT_ACCENT)
  const [glowColor, setGlowColor] = useLocalStorageState('glow-color', DEFAULT_GLOW)
  const [secondaryColor, setSecondaryColor] = useLocalStorageState('secondary-color', DEFAULT_SECONDARY)
  const [logoColor, setLogoColor] = useLocalStorageState('logo-color', DEFAULT_LOGO)

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

  // Auth & MFA state
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(false)

  const { data: agentStatus } = useQuery<{ name: string; emoji: string; model: string; status: string; host: string }>({
    queryKey: queryKeys.status,
    queryFn: () => api.get('/api/status'),
  })

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
        return <AppSection />
      case 'user':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsUser
              userName={userName} setUserName={setUserName}
              userAvatar={userAvatar} setUserAvatar={setUserAvatar}
              userEmail={userEmail} hasPassword={hasPassword}
              mfaEnabled={mfaEnabled} setMfaEnabled={setMfaEnabled}
              setupMfaRequired={setupMfaRequired}
            />
          </Suspense>
        )
      case 'connections':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsConnections />
          </Suspense>
        )
      case 'display':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsDisplay
              theme={theme} setTheme={setTheme}
              accentColor={accentColor} setAccent={setAccent}
              secondaryColor={secondaryColor} setSecondary={setSecondary}
              glowColor={glowColor} setGlow={setGlow}
              logoColor={logoColor} setLogo={setLogo}
            />
          </Suspense>
        )
      case 'keybindings':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsKeybindings />
          </Suspense>
        )
      case 'modules':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsModules />
          </Suspense>
        )
      case 'notifications':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsNotifications />
          </Suspense>
        )
      case 'privacy':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsPrivacy />
          </Suspense>
        )
      case 'data':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsData />
          </Suspense>
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
                      border: 'none', color: active ? 'var(--text-on-color)' : 'var(--text-secondary)',
                      fontSize: '13px', fontWeight: active ? 600 : 450, cursor: 'pointer',
                      textAlign: 'left', whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                      outline: isFocused ? '1px solid rgba(167,139,250,0.4)' : 'none',
                      outlineOffset: '-1px',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = isFocused ? 'rgba(167,139,250,0.10)' : 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                    onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--active-bg)' : isFocused ? 'rgba(167,139,250,0.10)' : 'transparent'; e.currentTarget.style.color = active ? 'var(--text-on-color)' : 'var(--text-secondary)' }}
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
