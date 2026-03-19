import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle, ChevronLeft, ChevronRight, Loader2, SkipForward,
  Database, MessageSquare, Bot, Rocket, Server, Film, Mail,
  CalendarDays, Bell, Brain, Eye, EyeOff,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import { getEnabledModules, setEnabledModules, APP_MODULES } from '@/lib/modules'

const STORAGE_KEY = 'setup-complete'

// ── Shared styles ──

const wizardInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  fontSize: '13px',
  fontFamily: 'monospace',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '10px',
  border: 'none',
  background: 'var(--accent-solid)',
  color: 'var(--text-on-color)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'filter 0.15s ease',
}

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontWeight: 500,
}

const skipBtn: React.CSSProperties = {
  ...secondaryBtn,
  border: 'none',
  fontSize: '12px',
  color: 'var(--text-muted)',
  padding: '8px 12px',
}

const fieldLabel: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  marginBottom: '4px',
  display: 'block',
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'error'

interface StepProps {
  onNext: () => void
  onBack: () => void
}

// ── Field definitions for each service group ──

interface FieldDef {
  /** Display label */
  label: string
  /** Keychain key: e.g. "bluebubbles.host" */
  keychainKey: string
  /** Placeholder text */
  placeholder: string
  /** Whether this is a secret (password field) */
  secret?: boolean
  /** Input type override */
  type?: string
}

interface ServiceGroupDef {
  /** Unique ID */
  id: string
  /** Display name */
  title: string
  /** Description */
  description: string
  /** Icon component */
  icon: React.ElementType
  /** Which module IDs enable this group (empty = always shown) */
  moduleIds: string[]
  /** Whether this step can be skipped */
  optional: boolean
  /** Skip button label */
  skipLabel?: string
  /** Fields to collect */
  fields: FieldDef[]
  /** Supabase service name for PUT /api/secrets/:service */
  services: { name: string; fieldKeys: string[] }[]
  /** Connection test endpoint key (in /api/status/connections response) */
  testKey?: string
}

const SERVICE_GROUPS: ServiceGroupDef[] = [
  {
    id: 'bluebubbles',
    title: 'BlueBubbles',
    description: 'iMessage bridge for Messages. Requires a Mac running the BlueBubbles server.',
    icon: MessageSquare,
    moduleIds: ['messages'],
    optional: true,
    skipLabel: "Skip — I don't have a Mac",
    fields: [
      { label: 'BlueBubbles Host URL', keychainKey: 'bluebubbles.host', placeholder: 'http://100.x.x.x:1234' },
      { label: 'BlueBubbles Password', keychainKey: 'bluebubbles.password', placeholder: 'Server password', secret: true },
    ],
    services: [{ name: 'bluebubbles', fieldKeys: ['bluebubbles.host', 'bluebubbles.password'] }],
    testKey: 'bluebubbles',
  },
  {
    id: 'openclaw',
    title: 'OpenClaw',
    description: 'Remote AI workspace that powers chat sessions and agent tasks.',
    icon: Bot,
    moduleIds: ['chat'],
    optional: false,
    fields: [
      { label: 'OpenClaw API URL', keychainKey: 'openclaw.api-url', placeholder: 'http://100.x.x.x:18789' },
      { label: 'OpenClaw API Key', keychainKey: 'openclaw.api-key', placeholder: 'API key', secret: true },
      { label: 'OpenClaw WebSocket URL', keychainKey: 'openclaw.ws', placeholder: 'ws://100.x.x.x:18789/ws' },
      { label: 'OpenClaw Password', keychainKey: 'openclaw.password', placeholder: 'Password', secret: true },
    ],
    services: [{ name: 'openclaw', fieldKeys: ['openclaw.api-url', 'openclaw.api-key', 'openclaw.ws', 'openclaw.password'] }],
    testKey: 'openclaw',
  },
  {
    id: 'homelab',
    title: 'Home Lab',
    description: 'Proxmox virtualization and OPNsense firewall monitoring.',
    icon: Server,
    moduleIds: ['homelab'],
    optional: true,
    skipLabel: "Skip — I don't have a homelab",
    fields: [
      { label: 'Proxmox Host URL', keychainKey: 'proxmox.host', placeholder: 'https://100.x.x.x:8006' },
      { label: 'Proxmox Token ID', keychainKey: 'proxmox.token-id', placeholder: 'user@pam!token-name' },
      { label: 'Proxmox Token Secret', keychainKey: 'proxmox.token-secret', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: true },
      { label: 'OPNsense Host URL', keychainKey: 'opnsense.host', placeholder: 'https://100.x.x.x' },
      { label: 'OPNsense API Key', keychainKey: 'opnsense.key', placeholder: 'API key', secret: true },
      { label: 'OPNsense API Secret', keychainKey: 'opnsense.secret', placeholder: 'API secret', secret: true },
    ],
    services: [
      { name: 'proxmox', fieldKeys: ['proxmox.host', 'proxmox.token-id', 'proxmox.token-secret'] },
      { name: 'opnsense', fieldKeys: ['opnsense.host', 'opnsense.key', 'opnsense.secret'] },
    ],
    testKey: 'proxmox',
  },
  {
    id: 'media',
    title: 'Media Radar',
    description: 'Plex media server, Sonarr for TV, and Radarr for movies.',
    icon: Film,
    moduleIds: ['media'],
    optional: true,
    skipLabel: 'Skip — no media stack',
    fields: [
      { label: 'Plex URL', keychainKey: 'plex.url', placeholder: 'http://100.x.x.x:32400' },
      { label: 'Plex Token', keychainKey: 'plex.token', placeholder: 'X-Plex-Token value', secret: true },
      { label: 'Sonarr URL', keychainKey: 'sonarr.url', placeholder: 'http://100.x.x.x:8989' },
      { label: 'Sonarr API Key', keychainKey: 'sonarr.api-key', placeholder: 'API key', secret: true },
      { label: 'Radarr URL', keychainKey: 'radarr.url', placeholder: 'http://100.x.x.x:7878' },
      { label: 'Radarr API Key', keychainKey: 'radarr.api-key', placeholder: 'API key', secret: true },
    ],
    services: [
      { name: 'plex', fieldKeys: ['plex.url', 'plex.token'] },
      { name: 'sonarr', fieldKeys: ['sonarr.url', 'sonarr.api-key'] },
      { name: 'radarr', fieldKeys: ['radarr.url', 'radarr.api-key'] },
    ],
  },
  {
    id: 'email',
    title: 'Email',
    description: 'IMAP email integration for inbox monitoring.',
    icon: Mail,
    moduleIds: ['email'],
    optional: true,
    skipLabel: 'Skip — no email integration',
    fields: [
      { label: 'IMAP Host', keychainKey: 'email.host', placeholder: 'imap.example.com' },
      { label: 'IMAP Port', keychainKey: 'email.port', placeholder: '993', type: 'text' },
      { label: 'Email Username', keychainKey: 'email.user', placeholder: 'you@example.com' },
      { label: 'Email Password', keychainKey: 'email.password', placeholder: 'App password', secret: true },
    ],
    services: [{ name: 'email', fieldKeys: ['email.host', 'email.port', 'email.user', 'email.password'] }],
  },
  {
    id: 'calendar',
    title: 'Calendar',
    description: 'CalDAV calendar integration.',
    icon: CalendarDays,
    moduleIds: ['calendar'],
    optional: true,
    skipLabel: 'Skip — no CalDAV',
    fields: [
      { label: 'CalDAV URL', keychainKey: 'caldav.url', placeholder: 'https://caldav.example.com/dav/' },
      { label: 'CalDAV Username', keychainKey: 'caldav.username', placeholder: 'username' },
      { label: 'CalDAV Password', keychainKey: 'caldav.password', placeholder: 'Password', secret: true },
    ],
    services: [{ name: 'caldav', fieldKeys: ['caldav.url', 'caldav.username', 'caldav.password'] }],
  },
  {
    id: 'ntfy',
    title: 'Notifications (ntfy)',
    description: 'Push notifications via ntfy server.',
    icon: Bell,
    moduleIds: [],
    optional: true,
    skipLabel: 'Skip — no ntfy',
    fields: [
      { label: 'ntfy URL', keychainKey: 'ntfy.url', placeholder: 'https://ntfy.example.com' },
      { label: 'ntfy Topic', keychainKey: 'ntfy.topic', placeholder: 'mission-control' },
    ],
    services: [{ name: 'ntfy', fieldKeys: ['ntfy.url', 'ntfy.topic'] }],
  },
  {
    id: 'anthropic',
    title: 'Anthropic',
    description: 'Anthropic API key for direct Claude access.',
    icon: Brain,
    moduleIds: [],
    optional: true,
    skipLabel: 'Skip — no Anthropic key',
    fields: [
      { label: 'Anthropic API Key', keychainKey: 'anthropic.api-key', placeholder: 'sk-ant-...', secret: true },
    ],
    services: [{ name: 'anthropic', fieldKeys: ['anthropic.api-key'] }],
  },
]

// Map keychain keys to Supabase credential keys (strip the service prefix, replace . and - with _)
function keychainKeyToCredKey(keychainKey: string): string {
  const parts = keychainKey.split('.')
  // e.g. "bluebubbles.host" -> "host", "openclaw.api-url" -> "api_url"
  const credPart = parts.slice(1).join('_')
  return credPart.replace(/-/g, '_')
}

// ── Step 1: Welcome ──

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
      <img
        src="/logo-128.png"
        alt="OpenClaw Manager"
        width={72}
        height={72}
        style={{ borderRadius: '18px' }}
      />
      <div style={{ textAlign: 'center' }}>
        <h2 id="ob-title" style={{
          margin: 0, fontSize: '22px', fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.02em',
        }}>
          Welcome to OpenClaw Manager
        </h2>
        <p style={{
          margin: '10px 0 0', fontSize: '13px',
          color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '340px',
        }}>
          Your personal command center for messages, tasks, and AI chat.
          Let's connect your services so everything works together.
        </p>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '6px', width: '100%',
        padding: '12px 16px', borderRadius: '12px',
        background: 'var(--bg-white-03)', border: '1px solid var(--bg-white-04)',
      }}>
        <SetupFeature icon={Database} title="Supabase" desc="Database and authentication (required)" />
        <SetupFeature icon={Bot} title="AI & Chat" desc="OpenClaw, Anthropic (optional)" />
        <SetupFeature icon={MessageSquare} title="Messages" desc="iMessage via BlueBubbles (Mac only)" />
        <SetupFeature icon={Server} title="Services" desc="Homelab, Media, Email, Calendar, Notifications" />
      </div>
      <button
        onClick={onNext}
        autoFocus
        style={{ ...primaryBtn, width: '100%', justifyContent: 'center', marginTop: '4px' }}
        className="hover-bg-bright"
      >
        Let's Go <ChevronRight size={16} />
      </button>
    </div>
  )
}

function SetupFeature({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
      <div style={{
        width: '30px', height: '30px', borderRadius: '8px',
        background: 'var(--purple-a10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={14} style={{ color: 'var(--accent)' }} />
      </div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </div>
  )
}

// ── Step 2: Module Selection ──

function StepModuleSelection({ onNext, onBack }: StepProps) {
  const [enabled, setEnabled] = useState<string[]>(() => getEnabledModules())

  const toggle = useCallback((id: string) => {
    setEnabled(prev => {
      const next = prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
      return next
    })
  }, [])

  const handleNext = useCallback(() => {
    setEnabledModules(enabled)
    onNext()
  }, [enabled, onNext])

  // Group modules that have associated service credentials
  const serviceModules = APP_MODULES.filter(m =>
    SERVICE_GROUPS.some(sg => sg.moduleIds.includes(m.id))
  )
  const otherModules = APP_MODULES.filter(m =>
    !SERVICE_GROUPS.some(sg => sg.moduleIds.includes(m.id))
  )

  const iconMap: Record<string, React.ElementType> = {
    messages: MessageSquare, chat: Bot, homelab: Server, media: Film,
    email: Mail, calendar: CalendarDays,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Choose Your Modules
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Enable only the modules you use. We'll ask for credentials for enabled services in the next steps.
        </p>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: '2px',
        maxHeight: '280px', overflowY: 'auto',
        padding: '4px 0',
      }}>
        {/* Service modules first */}
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0', fontWeight: 600 }}>
          Requires configuration
        </div>
        {serviceModules.map(m => (
          <ModuleToggleRow
            key={m.id}
            label={m.name}
            desc={m.description}
            icon={iconMap[m.id]}
            checked={enabled.includes(m.id)}
            onChange={() => toggle(m.id)}
          />
        ))}
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0 4px', fontWeight: 600 }}>
          No configuration needed
        </div>
        {otherModules.map(m => (
          <ModuleToggleRow
            key={m.id}
            label={m.name}
            desc={m.description}
            checked={enabled.includes(m.id)}
            onChange={() => toggle(m.id)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <button onClick={onBack} style={secondaryBtn}>
          <ChevronLeft size={14} /> Back
        </button>
        <button onClick={handleNext} style={primaryBtn}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function ModuleToggleRow({ label, desc, icon: Icon, checked, onChange }: {
  label: string; desc: string; icon?: React.ElementType; checked: boolean; onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${desc}`}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
        borderRadius: '8px', border: 'none', background: 'transparent',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'background 0.15s ease',
      }}
      className="hover-bg"
    >
      {Icon && (
        <div style={{
          width: '26px', height: '26px', borderRadius: '6px',
          background: checked ? 'var(--accent-a10)' : 'var(--bg-white-04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          transition: 'background 0.15s ease',
        }}>
          <Icon size={12} style={{ color: checked ? 'var(--accent)' : 'var(--text-muted)' }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <div style={{
        width: '36px', height: '20px', borderRadius: '10px',
        background: checked ? 'var(--accent-solid)' : 'var(--bg-white-10)',
        position: 'relative', transition: 'background 0.2s ease', flexShrink: 0,
      }}>
        <div style={{
          width: '16px', height: '16px', borderRadius: '50%',
          background: '#fff',
          position: 'absolute', top: '2px',
          left: checked ? '18px' : '2px',
          transition: 'left 0.2s var(--ease-spring)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
    </button>
  )
}

// ── Step: Supabase ──

function StepSupabase({ onNext, onBack }: StepProps) {
  const [url, setUrl] = useState(import.meta.env.VITE_SUPABASE_URL || '')
  const [anonKey, setAnonKey] = useState(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const testConnection = useCallback(async () => {
    setTestStatus('testing')
    setErrorMsg('')
    try {
      const testUrl = url.replace(/\/+$/, '')
      const res = await fetch(`${testUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok || res.status === 200 || res.status === 404) {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        setErrorMsg(`HTTP ${res.status}`)
      }
    } catch (e) {
      setTestStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Connection failed')
    }
  }, [url, anonKey])

  const envConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          <Database size={16} style={{ verticalAlign: '-2px', marginRight: '8px', color: 'var(--accent)' }} />
          Supabase
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Supabase provides the database and authentication backend.
          {envConfigured && ' Your environment already has Supabase configured.'}
        </p>
      </div>

      {envConfigured ? (
        <div style={{
          padding: '12px 14px', borderRadius: '10px',
          background: 'rgba(52,211,153,0.08)', border: '1px solid var(--green-a15)',
          fontSize: '12px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <CheckCircle size={14} />
          Configured via environment variables
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="ob-supabase-url" style={fieldLabel}>
              Supabase URL
            </label>
            <input
              id="ob-supabase-url"
              style={wizardInput}
              value={url}
              onChange={e => { setUrl(e.target.value); setTestStatus('idle') }}
              placeholder="https://your-project.supabase.co"
              aria-label="Supabase URL"
            />
          </div>
          <div>
            <label htmlFor="ob-supabase-key" style={fieldLabel}>
              Anon Key
            </label>
            <input
              id="ob-supabase-key"
              style={wizardInput}
              value={anonKey}
              onChange={e => { setAnonKey(e.target.value); setTestStatus('idle') }}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              type="password"
              aria-label="Supabase anon key"
            />
          </div>
        </>
      )}

      <TestResult status={testStatus} errorMsg={errorMsg} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <button onClick={onBack} style={secondaryBtn}>
          <ChevronLeft size={14} /> Back
        </button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!envConfigured && (
            <button
              onClick={testConnection}
              disabled={!url || !anonKey || testStatus === 'testing'}
              style={{ ...secondaryBtn, opacity: (!url || !anonKey) ? 0.5 : 1 }}
              aria-label="Test Supabase connection"
            >
              {testStatus === 'testing' ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testing...</> : 'Test Connection'}
            </button>
          )}
          <button onClick={onNext} style={primaryBtn}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Generic Service Step ──

function StepServiceGroup({ group, onNext, onBack }: StepProps & { group: ServiceGroupDef }) {
  const Icon = group.icon
  const [values, setValues] = useState<Record<string, string>>({})
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const loadedRef = useRef(false)

  // Load existing values from keychain
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    if (!window.__TAURI_INTERNALS__) return
    import('@tauri-apps/api/core').then(({ invoke }) => {
      Promise.all(
        group.fields.map(f =>
          invoke<string | null>('get_secret', { key: f.keychainKey })
            .then(v => ({ key: f.keychainKey, value: v }))
            .catch(() => ({ key: f.keychainKey, value: null }))
        )
      ).then(results => {
        const loaded: Record<string, string> = {}
        for (const r of results) {
          if (r.value) loaded[r.key] = r.value
        }
        if (Object.keys(loaded).length > 0) {
          setValues(prev => ({ ...loaded, ...prev }))
        }
      })
    })
  }, [group.fields])

  const setField = useCallback((key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }))
    setTestStatus('idle')
  }, [])

  const toggleVisibility = useCallback((key: string) => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const testConnection = useCallback(async () => {
    if (!group.testKey) return
    setTestStatus('testing')
    setErrorMsg('')
    try {
      const data = await api.get<Record<string, { status: string; latency_ms?: number; error?: string }>>('/api/status/connections')
      const result = data?.[group.testKey]
      if (result?.status === 'ok') {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        setErrorMsg(result?.error || 'Not connected')
      }
    } catch (e) {
      setTestStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Connection test failed')
    }
  }, [group.testKey])

  const saveAndNext = useCallback(async () => {
    const hasAnyValue = group.fields.some(f => values[f.keychainKey]?.trim())
    if (!hasAnyValue) {
      onNext()
      return
    }

    setSaving(true)
    try {
      // Save to OS keychain
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await Promise.all(
          group.fields
            .filter(f => values[f.keychainKey]?.trim())
            .map(f => invoke('set_secret', { key: f.keychainKey, value: values[f.keychainKey].trim() }))
        ).catch(e => console.warn('Keychain save (best-effort):', e))
      }

      // Save to Supabase via backend API (grouped by service)
      for (const svc of group.services) {
        const creds: Record<string, string> = {}
        for (const fk of svc.fieldKeys) {
          const val = values[fk]?.trim()
          if (val) creds[keychainKeyToCredKey(fk)] = val
        }
        if (Object.keys(creds).length > 0) {
          await api.put(`/api/secrets/${svc.name}`, { credentials: creds }).catch(e => {
            console.warn(`Failed to save ${svc.name} to Supabase (best-effort):`, e)
          })
        }
      }
    } catch (e) {
      console.warn('Failed to save credentials:', e)
    } finally {
      setSaving(false)
    }
    onNext()
  }, [values, group, onNext])

  const hasAnyUrl = group.fields.some(f => !f.secret && values[f.keychainKey]?.trim())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          <Icon size={16} style={{ verticalAlign: '-2px', marginRight: '8px', color: 'var(--accent)' }} />
          {group.title}
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {group.description}
        </p>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        maxHeight: '260px', overflowY: 'auto',
        paddingRight: '4px',
      }}>
        {group.fields.map(f => {
          const fieldId = `ob-${f.keychainKey.replace(/\./g, '-')}`
          const isVisible = visibility[f.keychainKey]
          return (
            <div key={f.keychainKey}>
              <label htmlFor={fieldId} style={fieldLabel}>
                {f.label}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id={fieldId}
                  style={{
                    ...wizardInput,
                    ...(f.secret ? { paddingRight: '40px' } : {}),
                  }}
                  value={values[f.keychainKey] || ''}
                  onChange={e => setField(f.keychainKey, e.target.value)}
                  placeholder={f.placeholder}
                  type={f.secret && !isVisible ? 'password' : (f.type || 'text')}
                  aria-label={f.label}
                  autoComplete="off"
                />
                {f.secret && (
                  <button
                    type="button"
                    onClick={() => toggleVisibility(f.keychainKey)}
                    aria-label={isVisible ? `Hide ${f.label}` : `Show ${f.label}`}
                    style={{
                      position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                      color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                    }}
                  >
                    {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <TestResult status={testStatus} errorMsg={errorMsg} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <button onClick={onBack} style={secondaryBtn}>
          <ChevronLeft size={14} /> Back
        </button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {group.testKey && hasAnyUrl && (
            <button
              onClick={testConnection}
              disabled={testStatus === 'testing'}
              style={secondaryBtn}
              aria-label={`Test ${group.title} connection`}
            >
              {testStatus === 'testing' ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testing...</> : 'Test'}
            </button>
          )}
          <button onClick={saveAndNext} disabled={saving} style={primaryBtn}>
            {saving ? 'Saving...' : 'Next'} {!saving && <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {group.optional && (
        <button onClick={() => onNext()} style={{ ...skipBtn, alignSelf: 'center' }}>
          <SkipForward size={12} /> {group.skipLabel || 'Skip for now'}
        </button>
      )}
    </div>
  )
}

// ── Step: Done ──

function StepDone({ onFinish, activeGroups }: { onFinish: () => void; activeGroups: ServiceGroupDef[] }) {
  const [configuredServices, setConfiguredServices] = useState<Record<string, boolean>>({})
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAll = async () => {
      const results: Record<string, boolean> = {}

      // Check Supabase via env vars
      results['Supabase'] = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

      // Check all active service groups via keychain
      if (window.__TAURI_INTERNALS__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          for (const group of activeGroups) {
            // Check if the first field (usually the URL/host) is configured
            const firstField = group.fields[0]
            if (firstField) {
              const val = await invoke<string | null>('get_secret', { key: firstField.keychainKey }).catch(() => null)
              results[group.title] = !!val
            }
          }
        } catch { /* */ }
      }

      // Fallback: try backend health check
      if (!results['Supabase']) {
        try {
          const res = await fetch('http://127.0.0.1:3000/api/status', { signal: AbortSignal.timeout(3000) })
          if (res.ok) results['Supabase'] = true
        } catch { /* */ }
      }

      setConfiguredServices(results)
      setChecking(false)
    }
    checkAll()
  }, [activeGroups])

  const allLabels = ['Supabase', ...activeGroups.map(g => g.title)]
  const connectedCount = allLabels.filter(l => configuredServices[l]).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%',
        background: 'var(--green-a12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Rocket size={28} style={{ color: 'var(--green)' }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          You're all set!
        </h3>
        <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {connectedCount === 0 && 'No services configured yet. You can set them up later in Settings.'}
          {connectedCount > 0 && connectedCount < allLabels.length && `${connectedCount} of ${allLabels.length} services configured.`}
          {connectedCount === allLabels.length && connectedCount > 0 && 'All services configured!'}
        </p>
      </div>

      {!checking && (
        <div style={{
          width: '100%', display: 'flex', flexDirection: 'column', gap: '6px',
          padding: '12px 16px', borderRadius: '12px',
          background: 'var(--bg-white-03)', border: '1px solid var(--bg-white-04)',
          maxHeight: '200px', overflowY: 'auto',
        }}>
          {allLabels.map(label => (
            <ConnectionSummaryRow key={label} label={label} connected={!!configuredServices[label]} />
          ))}
        </div>
      )}

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
        You can reconfigure connections anytime in Settings.
      </p>

      <button
        onClick={onFinish}
        autoFocus
        style={{ ...primaryBtn, width: '100%', justifyContent: 'center', marginTop: '4px' }}
      >
        Get Started
      </button>
    </div>
  )
}

function ConnectionSummaryRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{
        fontSize: '11px', fontFamily: 'monospace',
        color: connected ? 'var(--green)' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: connected ? 'var(--green)' : 'var(--bg-white-15)',
          display: 'inline-block',
        }} />
        {connected ? 'Configured' : 'Skipped'}
      </span>
    </div>
  )
}

// ── Test result badge ──

function TestResult({ status, errorMsg }: { status: TestStatus; errorMsg: string }) {
  if (status === 'idle') return null
  if (status === 'testing') return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
      background: 'var(--accent-a10)', border: '1px solid var(--accent-a12)',
      color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
      Testing connection...
    </div>
  )
  if (status === 'ok') return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
      background: 'rgba(52,211,153,0.08)', border: '1px solid var(--green-a15)',
      color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      <CheckCircle size={12} />
      Connection successful
    </div>
  )
  return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
      background: 'var(--red-a08)', border: '1px solid var(--red-a15)',
      color: 'var(--red)', lineHeight: 1.4,
    }}>
      Connection failed{errorMsg ? `: ${errorMsg}` : ''}
    </div>
  )
}

// ── Progress dots ──

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: current === i ? '20px' : '6px',
            height: '6px',
            borderRadius: '3px',
            background: current === i ? 'var(--accent)' : 'var(--bg-white-15)',
            transition: 'all 0.3s var(--ease-spring)',
          }}
        />
      ))}
    </div>
  )
}

// ── Main wizard ──

export default function OnboardingWelcome({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState(0)

  // Determine which service groups to show based on enabled modules
  const activeGroups = useMemo(() => {
    const enabled = getEnabledModules()
    return SERVICE_GROUPS.filter(group => {
      // Groups with empty moduleIds are always shown (optional global services)
      if (group.moduleIds.length === 0) return true
      // Show if any of the group's required modules are enabled
      return group.moduleIds.some(id => enabled.includes(id))
    })
  }, [step]) // Re-evaluate after module selection step

  // Steps: Welcome(0) + ModuleSelection(1) + Supabase(2) + N service groups + Done
  const totalSteps = 3 + activeGroups.length // welcome + modules + supabase + services + done

  useEffect(() => {
    if (forceOpen) {
      setVisible(true)
      setStep(0)
    } else if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
    setMounted(true)
  }, [forceOpen])

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setVisible(false)
    onClose?.()
  }, [onClose])

  const trapRef = useFocusTrap(visible)
  useEscapeKey(dismiss, visible)

  if (!visible || !mounted) return null

  const next = () => setStep(s => Math.min(s + 1, totalSteps - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  const renderStep = () => {
    if (step === 0) return <StepWelcome onNext={next} />
    if (step === 1) return <StepModuleSelection onNext={next} onBack={back} />
    if (step === 2) return <StepSupabase onNext={next} onBack={back} />

    const serviceIndex = step - 3
    if (serviceIndex < activeGroups.length) {
      return <StepServiceGroup group={activeGroups[serviceIndex]} onNext={next} onBack={back} />
    }

    // Final step
    return <StepDone onFinish={dismiss} activeGroups={activeGroups} />
  }

  // Calculate the step label for service steps
  const isServiceStep = step >= 3 && step < totalSteps - 1
  const serviceStepNumber = isServiceStep ? step - 2 : 0
  const totalServiceSteps = activeGroups.length + 1 // +1 for Supabase

  return createPortal(
    <>
      <style>{`
        @keyframes ob-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ob-scalein {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.94); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>

      <div
        onClick={step === 0 ? dismiss : undefined}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--overlay-heavy)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 'var(--z-modal-backdrop)' as React.CSSProperties['zIndex'],
          animation: 'ob-fadein 0.2s ease',
        }}
      />

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '480px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'rgba(18, 18, 24, 0.97)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid var(--hover-bg-bright)',
          borderRadius: '20px',
          boxShadow:
            '0 32px 100px var(--overlay-heavy), 0 0 0 1px var(--bg-white-04)',
          zIndex: 'var(--z-modal)' as React.CSSProperties['zIndex'],
          animation: 'ob-scalein 0.25s var(--ease-spring)',
        }}
      >
        {/* Step label */}
        {step >= 2 && step < totalSteps - 1 && (
          <div style={{
            padding: '16px 28px 0', fontSize: '11px',
            color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            Service {step === 2 ? 1 : serviceStepNumber} of {totalServiceSteps}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '24px 28px 16px' }}>
          {renderStep()}
        </div>

        {/* Progress dots */}
        <div style={{ padding: '0 28px 20px' }}>
          <ProgressDots current={step} total={totalSteps} />
        </div>
      </div>
    </>,
    document.body,
  )
}

/** Reset setup completion flag — used by Settings "Re-run Setup" button */
export function resetSetupWizard() {
  localStorage.removeItem(STORAGE_KEY)
}
