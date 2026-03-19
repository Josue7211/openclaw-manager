import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { useSaveSecret } from '@/hooks/useUserSecrets'
import OnboardingWelcome, { resetSetupWizard } from '@/components/OnboardingWelcome'
import { row, rowLast, val, inputStyle, btnStyle, btnSecondary, sectionLabel } from './shared'

export default function SettingsConnections() {
  const [bbUrl, setBbUrl] = useState('')
  const [ocUrl, setOcUrl] = useState('')
  const [bbExpectedHost, setBbExpectedHost] = useState('')
  const [ocExpectedHost, setOcExpectedHost] = useState('')
  const [bindHost, setBindHost] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [connSaving, setConnSaving] = useState(false)
  const [connSaveStatus, setConnSaveStatus] = useState<string | null>(null)
  const [connTesting, setConnTesting] = useState(false)
  const [connResults, setConnResults] = useState<Record<string, { status: string; latency_ms?: number; error?: string; peer_hostname?: string; peer_verified?: boolean }> | null>(null)
  const [showSetupWizard, setShowSetupWizard] = useState(false)

  const saveSecretMutation = useSaveSecret()

  // Load saved connection URLs from the backend API first (Supabase-encrypted),
  // falling back to OS keychain, then to the backend's active config (which
  // includes .env.local values merged at startup).
  useEffect(() => {
    let keychainBb: string | null = null
    let keychainOc: string | null = null

    let keychainBindHost: string | null = null
    let keychainAgentKey: string | null = null

    const loadKeychain = window.__TAURI_INTERNALS__
      ? import('@tauri-apps/api/core').then(({ invoke }) =>
          Promise.all([
            invoke<string | null>('get_secret', { key: 'bluebubbles.host' }).then(v => { keychainBb = v }),
            invoke<string | null>('get_secret', { key: 'openclaw.api-url' }).then(v => { keychainOc = v }),
            invoke<string | null>('get_secret', { key: 'mc-bind.host' }).then(v => { keychainBindHost = v }),
            invoke<string | null>('get_secret', { key: 'mc-agent.key' }).then(v => { keychainAgentKey = v }),
          ])
        )
      : Promise.resolve()

    const loadFromApi = Promise.all([
      api.get<Record<string, string>>('/api/secrets/bluebubbles').catch(() => null),
      api.get<Record<string, string>>('/api/secrets/openclaw').catch(() => null),
    ])

    const loadActiveConfig = api.get<{ bluebubbles_url?: string; openclaw_url?: string }>('/api/status/active-config').catch(() => null)

    Promise.all([loadKeychain, loadFromApi, loadActiveConfig]).then(([, apiSecrets, activeConfig]) => {
      const [bbSecrets, ocSecrets] = apiSecrets ?? [null, null]
      // Priority: API secrets (Supabase) > OS keychain > active config (env)
      setBbUrl(bbSecrets?.url || keychainBb || activeConfig?.bluebubbles_url || '')
      setOcUrl(ocSecrets?.url || keychainOc || activeConfig?.openclaw_url || '')
      if (keychainBindHost) setBindHost(keychainBindHost)
      if (keychainAgentKey) setAgentKey(keychainAgentKey)
    })

    // Load expected hostnames from user preferences
    api.get<{ ok: boolean; data: Record<string, unknown> }>('/api/user-preferences').then(resp => {
      const prefs = resp?.data ?? resp
      if (prefs?.['bluebubbles.expected-host']) setBbExpectedHost(String(prefs['bluebubbles.expected-host']))
      if (prefs?.['openclaw.expected-host']) setOcExpectedHost(String(prefs['openclaw.expected-host']))
    }).catch(() => {})
  }, [])

  const saveConnections = useCallback(async () => {
    setConnSaving(true)
    setConnSaveStatus(null)
    try {
      // Save to Supabase (encrypted) via backend API
      await Promise.all([
        saveSecretMutation.mutateAsync({
          service: 'bluebubbles',
          credentials: { url: bbUrl },
        }),
        saveSecretMutation.mutateAsync({
          service: 'openclaw',
          credentials: { url: ocUrl },
        }),
      ])

      // Also save to OS keychain as local cache/fallback (for startup before login)
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await Promise.all([
          invoke('set_secret', { key: 'bluebubbles.host', value: bbUrl }),
          invoke('set_secret', { key: 'openclaw.api-url', value: ocUrl }),
          bindHost ? invoke('set_secret', { key: 'mc-bind.host', value: bindHost }) : Promise.resolve(),
          agentKey ? invoke('set_secret', { key: 'mc-agent.key', value: agentKey }) : Promise.resolve(),
        ]).catch(() => {
          // Keychain save is best-effort — API save is the source of truth
        })
      }

      // Save expected hostnames to user preferences
      await api.patch('/api/user-preferences', {
        preferences: {
          'bluebubbles.expected-host': bbExpectedHost,
          'openclaw.expected-host': ocExpectedHost,
        }
      }).catch(() => {})

      setConnSaveStatus('Saved & encrypted. Restart to apply changes.')
    } catch (e: unknown) {
      setConnSaveStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConnSaving(false)
    }
  }, [bbUrl, ocUrl, bbExpectedHost, ocExpectedHost, bindHost, agentKey, saveSecretMutation])

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

  const statusDot = (s?: string) => ({
    display: 'inline-block' as const, width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px',
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
      parts.push(<span key="pv" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--gold)', fontFamily: 'monospace', marginLeft: '8px' }} title={`Peer hostname "${r.peer_hostname}" does not match expected`}><AlertTriangle size={11} />peer mismatch</span>)
    } else if (r.peer_hostname) {
      parts.push(<span key="pv" style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: '8px' }} title="No expected hostname configured">peer: {r.peer_hostname}</span>)
    }
    return <>{parts}</>
  }
  const hostInputStyle: React.CSSProperties = { ...inputStyle, width: '140px', fontSize: '11px' }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '(not set)'

  return (
    <div>
      {isDemoMode() && (<div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} /><span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--warning)' }}>You're in demo mode</span></div><p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>No services are connected. The app is showing sample data so you can explore the interface. To use real data, set the following environment variables and restart:</p><div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.8 }}><div><span style={{ color: 'var(--accent)' }}>VITE_SUPABASE_URL</span>=https://your-project.supabase.co</div><div><span style={{ color: 'var(--accent)' }}>VITE_SUPABASE_ANON_KEY</span>=your-anon-key</div></div><p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>Then configure BlueBubbles and OpenClaw URLs below (saved to OS keychain).</p></div>)}
      <div style={sectionLabel}>Service Connections</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Configure URLs for external services. Credentials are encrypted and stored in Supabase with a local keychain fallback.
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

      <div style={{ ...sectionLabel, marginTop: '24px' }}>Server Access</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Allow external agents (like Bjorn) to reach the OpenClaw Manager API over Tailscale. Requires restart.
      </p>

      <div style={row}>
        <div style={{ flex: 1 }}>
          <span>Bind Address</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Default: 127.0.0.1 (localhost only). Set to 0.0.0.0 for Tailscale access.</div>
        </div>
        <input
          style={inputStyle}
          value={bindHost}
          onChange={e => setBindHost(e.target.value)}
          placeholder="127.0.0.1"
          aria-label="Server bind address"
        />
      </div>

      <div style={rowLast}>
        <div style={{ flex: 1 }}>
          <span>Agent API Key</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Stable key for external agents. Does not rotate on restart.</div>
        </div>
        <input
          type="password"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }}
          value={agentKey}
          onChange={e => setAgentKey(e.target.value)}
          placeholder="Generate or paste a key"
          aria-label="Agent API key"
        />
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
