
import { Gear, Bell, Palette, User, Desktop, Cpu, Lightning, CaretRight, ArrowLeft, Keyboard, SquaresFour, Plug, DownloadSimple, EyeSlash, FolderOpen, FileText, Heartbeat } from '@phosphor-icons/react'
import { useState, useEffect, memo, useCallback, lazy, Suspense } from 'react'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

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
const SettingsStatus = lazy(() => import('./settings/SettingsStatus'))

interface Pref {
  key: string
  value: string
}

type SettingsSection = 'agent' | 'gateway' | 'app' | 'user' | 'connections' | 'display' | 'keybindings' | 'modules' | 'notifications' | 'privacy' | 'status'

const SECTIONS: { key: SettingsSection; label: string; icon: React.ElementType; group: string }[] = [
  { key: 'agent', label: 'Agent', icon: Lightning, group: 'General' },
  { key: 'gateway', label: 'Gateway', icon: Desktop, group: 'General' },
  { key: 'app', label: 'OpenClaw Manager', icon: Cpu, group: 'General' },
  { key: 'user', label: 'User', icon: User, group: 'General' },
  { key: 'connections', label: 'Connections', icon: Plug, group: 'General' },
  { key: 'display', label: 'Personalization', icon: Palette, group: 'App Gear' },
  { key: 'keybindings', label: 'Keybinds', icon: Keyboard, group: 'App Gear' },
  { key: 'modules', label: 'Sidebar', icon: SquaresFour, group: 'App Gear' },
  { key: 'notifications', label: 'Notifications', icon: Bell, group: 'App Gear' },
  { key: 'privacy', label: 'Privacy & Data', icon: EyeSlash, group: 'App Gear' },
  { key: 'status', label: 'System Status', icon: Heartbeat, group: 'App Gear' },
]

const SECTION_GROUPS = [...new Set(SECTIONS.map(s => s.group))]


/** OpenClaw Manager app settings section with logging info */
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
      <div style={sectionLabel}>OpenClaw Manager</div>
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
          <DownloadSimple size={14} />
          Check for updates
        </button>
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
      const session = await api.get<{
        authenticated: boolean
        user?: { id: string; email: string; identities?: Array<{ provider: string }> }
        mfa_factors?: Array<{ id: string; status: string; type: string }>
      }>('/api/auth/session')
      if (!session.authenticated) return { user: null, mfaFactors: null }
      return { user: session.user ?? null, mfaFactors: session.mfa_factors ?? null }
    },
  })

  useEffect(() => {
    if (authUserData?.user) {
      setUserEmail(authUserData.user.email ?? null)
      setHasPassword(authUserData.user.identities?.some(i => i.provider === 'email') ?? false)
    }
    if (authUserData?.mfaFactors && authUserData.mfaFactors.length > 0) {
      setMfaEnabled(authUserData.mfaFactors.some(f => (f.type === 'totp' || f.type === 'webauthn') && f.status === 'verified'))
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
      case 'status':
        return (
          <Suspense fallback={<SectionFallback />}>
            <SettingsStatus />
          </Suspense>
        )
      default:
        return null
    }
  }

  // Group sections
  const groups = SECTION_GROUPS

  return (
    <div style={{ display: 'flex', position: 'absolute', inset: 0, margin: '-20px -28px', gap: '0', overflow: 'hidden' }}>
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
          <Gear size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Gear</h1>
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
                      background: active ? 'var(--active-bg)' : isFocused ? 'var(--accent-a10)' : 'transparent',
                      border: 'none', color: active ? 'var(--text-on-color)' : 'var(--text-secondary)',
                      fontSize: '13px', fontWeight: active ? 600 : 450, cursor: 'pointer',
                      textAlign: 'left', whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                      outline: isFocused ? '1px solid var(--accent-a40)' : 'none',
                      outlineOffset: '-1px',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = isFocused ? 'var(--accent-a10)' : 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                    onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--active-bg)' : isFocused ? 'var(--accent-a10)' : 'transparent'; e.currentTarget.style.color = active ? 'var(--text-on-color)' : 'var(--text-secondary)' }}
                  >
                    <s.icon size={16} style={{ flexShrink: 0, color: active ? 'var(--accent)' : undefined }} />
                    {s.label}
                    {!selected && <CaretRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
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
