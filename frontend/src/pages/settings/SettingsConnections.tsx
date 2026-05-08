import { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react'
import { Warning } from '@phosphor-icons/react'
import {
  api,
  CONFIGURED_BACKEND_BASE_CHANGED_EVENT,
  getConfiguredBackendBase,
  setApiBase,
  setApiKey,
  setConfiguredBackendBase,
} from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { getSetupStatus, normalizeBackendUrl, pairWithBackend } from '@/lib/setup'
import { useSaveSecret } from '@/hooks/useUserSecrets'
import { resetWizard as resetSetupWizard } from '@/lib/wizard-store'
import { Button } from '@/components/ui/Button'
import {
  CONNECTION_SETTINGS,
  type ConnectionSettingId,
  keychainKeyToCredKey,
} from '@/lib/service-registry'
import { row, rowLast, val, inputStyle, sectionLabel } from './shared'

const OnboardingWelcome = lazy(() => import('@/components/OnboardingWelcome'))

type CredentialMap = Record<string, string>

type SecretResponse =
  | {
      ok?: boolean
      data?: {
        credentials?: Record<string, unknown>
      }
      credentials?: Record<string, unknown>
    }
  | Record<string, unknown>
  | null

function emptyConnectionRecord(): Record<ConnectionSettingId, CredentialMap> {
  return Object.fromEntries(
    CONNECTION_SETTINGS.map(setting => [setting.id, {}])
  ) as Record<ConnectionSettingId, CredentialMap>
}

function extractCredentials(response: SecretResponse): CredentialMap {
  const source =
    response &&
    typeof response === 'object' &&
    'data' in response &&
    response.data &&
    typeof response.data === 'object' &&
    'credentials' in response.data &&
    response.data.credentials &&
    typeof response.data.credentials === 'object'
      ? response.data.credentials
      : response &&
        typeof response === 'object' &&
        'credentials' in response &&
        response.credentials &&
        typeof response.credentials === 'object'
        ? response.credentials
        : response && typeof response === 'object'
          ? response
          : {}

  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

export default function SettingsConnections() {
  const suppressNextBackendRefreshRef = useRef(false)
  const [connectionUrls, setConnectionUrls] = useState<Record<ConnectionSettingId, string>>({
    bluebubbles: '',
    harness: '',
    sunshine: '',
    vnc: '',
    agentsecrets: '',
    agentshell: '',
  })
  const [connectionCredentials, setConnectionCredentials] = useState<Record<ConnectionSettingId, CredentialMap>>(emptyConnectionRecord)
  const [savedCredentials, setSavedCredentials] = useState<Record<ConnectionSettingId, CredentialMap>>(emptyConnectionRecord)
  const [expectedHosts, setExpectedHosts] = useState<Record<ConnectionSettingId, string>>({
    bluebubbles: '',
    harness: '',
    sunshine: '',
    vnc: '',
    agentsecrets: '',
    agentshell: '',
  })
  const [bindHost, setBindHost] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [connSaving, setConnSaving] = useState(false)
  const [connSaveStatus, setConnSaveStatus] = useState<string | null>(null)
  const [connTesting, setConnTesting] = useState(false)
  const [connResults, setConnResults] = useState<Record<string, { status: string; latency_ms?: number; error?: string; peer_hostname?: string; peer_verified?: boolean }> | null>(null)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [backendUrl, setBackendUrl] = useState(getConfiguredBackendBase())
  const [pairingToken, setPairingToken] = useState('')
  const [backendChecking, setBackendChecking] = useState(false)
  const [backendSaving, setBackendSaving] = useState(false)
  const [backendPairing, setBackendPairing] = useState(false)
  const [backendStatus, setBackendStatus] = useState<null | {
    backend_public_base_url: string
    pairing_required: boolean
    services: {
      supabase: { configured: boolean; reachable: boolean }
      harness?: {
        configured: boolean
        reachable: boolean
        status?: string
        auth_valid?: boolean
        checked_path?: string | null
        message?: string | null
      }
      memd: { configured: boolean; reachable: boolean }
      agentsecrets: { configured: boolean; reachable: boolean }
    }
    missing: string[]
  }>(null)
  const [backendStatusMessage, setBackendStatusMessage] = useState<string | null>(null)

  const saveSecretMutation = useSaveSecret()

  const updateConnectionUrl = useCallback((id: ConnectionSettingId, value: string) => {
    setConnectionUrls(prev => ({ ...prev, [id]: value }))
  }, [])

  const updateExpectedHost = useCallback((id: ConnectionSettingId, value: string) => {
    setExpectedHosts(prev => ({ ...prev, [id]: value }))
  }, [])

  const updateConnectionCredential = useCallback((id: ConnectionSettingId, keychainKey: string, value: string) => {
    setConnectionCredentials(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [keychainKey]: value,
      },
    }))
  }, [])

  // Load saved connection URLs from the backend API first (Supabase-encrypted),
  // falling back to OS keychain, then to the backend's active config (which
  // includes .env.local values merged at startup).
  useEffect(() => {
    let keychainBindHost: string | null = null
    let keychainAgentKey: string | null = null
    let keychainBackendBase: string | null = null

    const loadKeychain = window.__TAURI_INTERNALS__
      ? import('@tauri-apps/api/core').then(({ invoke }) =>
          Promise.all([
            ...CONNECTION_SETTINGS.map(setting =>
              invoke<string | null>('get_secret', { key: setting.urlKeychainKey }).then(v => {
                setConnectionUrls(prev => ({ ...prev, [setting.id]: v || prev[setting.id] }))
              })
            ),
            invoke<string | null>('get_secret', { key: 'mc-bind.host' }).then(v => { keychainBindHost = v }),
            invoke<string | null>('get_secret', { key: 'mc-agent.key' }).then(v => { keychainAgentKey = v }),
            invoke<string | null>('get_secret', { key: 'backend.public-base-url' }).then(v => { keychainBackendBase = v }),
          ])
        ).catch(() => {})
      : Promise.resolve()

    const loadFromApi = Promise.all(
      CONNECTION_SETTINGS.map(setting =>
        api.get<SecretResponse>(`/api/secrets/${setting.apiSecretService}`).catch(() => null)
      )
    )

    const loadActiveConfig = api.get<{
      bluebubbles_url?: string
      harness_url?: string
      sunshine_url?: string
      vnc_url?: string
      agentsecrets_url?: string
      agentshell_url?: string
    }>('/api/status/active-config').catch(() => null)

    Promise.all([loadKeychain, loadFromApi, loadActiveConfig]).then(([, apiSecrets, activeConfig]) => {
      const activeConfigMap: Record<ConnectionSettingId, string> = {
        bluebubbles: activeConfig?.bluebubbles_url || '',
        harness: activeConfig?.harness_url || '',
        sunshine: activeConfig?.sunshine_url || '',
        vnc: activeConfig?.vnc_url || '',
        agentsecrets: activeConfig?.agentsecrets_url || '',
        agentshell: activeConfig?.agentshell_url || '',
      }

      const loadedUrls: Partial<Record<ConnectionSettingId, string>> = {}
      const loadedCredentials: Partial<Record<ConnectionSettingId, CredentialMap>> = {}
      const loadedFieldValues: Partial<Record<ConnectionSettingId, CredentialMap>> = {}
      CONNECTION_SETTINGS.forEach((setting, index) => {
        const credentials = extractCredentials(apiSecrets?.[index] ?? null)
        const apiUrl = credentials.url
        loadedUrls[setting.id] = apiUrl || activeConfigMap[setting.id] || ''
        loadedCredentials[setting.id] = credentials
        loadedFieldValues[setting.id] = Object.fromEntries(
          (setting.credentialFields ?? []).map(field => {
            const credKey = keychainKeyToCredKey(field.keychainKey)
            return [field.keychainKey, field.secret ? '' : credentials[credKey] || '']
          })
        )
      })
      setConnectionUrls(prev => ({ ...prev, ...loadedUrls }))
      setSavedCredentials(prev => ({ ...prev, ...loadedCredentials }))
      setConnectionCredentials(prev => ({ ...prev, ...loadedFieldValues }))

      if (keychainBindHost) setBindHost(keychainBindHost)
      if (keychainAgentKey) setAgentKey(keychainAgentKey)
      if (keychainBackendBase) setBackendUrl(keychainBackendBase)
    }).catch(() => {})

    // Load expected hostnames from user preferences
    api.get<{ ok: boolean; data: Record<string, unknown> }>('/api/user-preferences').then(resp => {
      const prefs = resp?.data ?? resp
      CONNECTION_SETTINGS.forEach(setting => {
        const value = prefs?.[setting.expectedHostPreferenceKey]
        if (value) {
          updateExpectedHost(setting.id, String(value))
        }
      })
    }).catch(() => {})
  }, [updateExpectedHost])

  const refreshBackendStatus = useCallback(async (targetBase = backendUrl, announce = true) => {
    setBackendChecking(true)
    if (announce) setBackendStatusMessage(null)
    try {
      const status = await getSetupStatus(targetBase)
      setBackendStatus(status)
      if (announce) setBackendStatusMessage('Backend reachable')
      return status
    } catch (e: unknown) {
      setBackendStatus(null)
      setBackendStatusMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
      return null
    } finally {
      setBackendChecking(false)
    }
  }, [backendUrl])

  useEffect(() => {
    void refreshBackendStatus(getConfiguredBackendBase(), false)
  }, [refreshBackendStatus])

  useEffect(() => {
    const onBackendChanged = () => {
      if (suppressNextBackendRefreshRef.current) {
        suppressNextBackendRefreshRef.current = false
        return
      }
      const nextBase = getConfiguredBackendBase()
      setBackendUrl(nextBase)
      void refreshBackendStatus(nextBase, false)
    }

    window.addEventListener(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, onBackendChanged)
    return () => window.removeEventListener(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, onBackendChanged)
  }, [refreshBackendStatus])

  const saveBackendTarget = useCallback(async () => {
    const normalized = normalizeBackendUrl(backendUrl)
    if (!normalized) {
      setBackendStatusMessage('Error: backend URL is required')
      return
    }

    setBackendSaving(true)
    setBackendStatusMessage(null)
    try {
      await getSetupStatus(normalized)
      let deviceApiKey: string | null = null
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        deviceApiKey = await invoke<string | null>('get_secret', { key: 'backend.device-api-key' }).catch(() => null)
        await invoke('set_secret', { key: 'backend.public-base-url', value: normalized })
      }
      suppressNextBackendRefreshRef.current = true
      setConfiguredBackendBase(normalized)
      if (deviceApiKey?.trim()) {
        setApiBase(normalized)
        setApiKey(deviceApiKey)
        const { setChatSocketApiKey } = await import('@/lib/hooks/useChatSocket')
        setChatSocketApiKey(deviceApiKey)
      }
      setBackendUrl(normalized)
      await refreshBackendStatus(normalized, false)
      setBackendStatusMessage('Backend target saved')
    } catch (e: unknown) {
      setBackendStatusMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBackendSaving(false)
    }
  }, [backendUrl, refreshBackendStatus])

  const handlePairBackend = useCallback(async () => {
    const normalized = normalizeBackendUrl(backendUrl)
    if (!normalized) {
      setBackendStatusMessage('Error: backend URL is required')
      return
    }
    if (!pairingToken.trim()) {
      setBackendStatusMessage('Error: pairing token is required')
      return
    }

    setBackendPairing(true)
    setBackendStatusMessage(null)
    try {
      const pairResult = await pairWithBackend(pairingToken.trim(), 'clawctrl Desktop', normalized)
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_secret', { key: 'backend.public-base-url', value: normalized })
        if (pairResult.device_api_key) {
          await invoke('set_secret', { key: 'backend.device-api-key', value: pairResult.device_api_key })
        }
      }
      suppressNextBackendRefreshRef.current = true
      setConfiguredBackendBase(normalized)
      setApiBase(normalized)
      if (pairResult.device_api_key?.trim()) {
        setApiKey(pairResult.device_api_key)
        const { setChatSocketApiKey } = await import('@/lib/hooks/useChatSocket')
        setChatSocketApiKey(pairResult.device_api_key)
      }
      setBackendUrl(normalized)
      setPairingToken('')
      await refreshBackendStatus(normalized, false)
      setBackendStatusMessage('Backend paired')
    } catch (e: unknown) {
      setBackendStatusMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBackendPairing(false)
    }
  }, [backendUrl, pairingToken, refreshBackendStatus])

  const saveConnections = useCallback(async () => {
    setConnSaving(true)
    setConnSaveStatus(null)
    try {
      // Save to Supabase (encrypted) via backend API
      await Promise.all([
        ...CONNECTION_SETTINGS.map(setting => {
          const credentials: Record<string, string> = {
            ...(savedCredentials[setting.id] ?? {}),
            url: connectionUrls[setting.id],
          }

          for (const field of setting.credentialFields ?? []) {
            const credKey = keychainKeyToCredKey(field.keychainKey)
            const value = connectionCredentials[setting.id]?.[field.keychainKey]?.trim() ?? ''
            if (value) {
              credentials[credKey] = value
            } else if (!field.secret) {
              delete credentials[credKey]
            }
          }

          return saveSecretMutation.mutateAsync({
            service: setting.apiSecretService,
            credentials,
          })
        }),
      ])

      // Also save to OS keychain as local cache/fallback (for startup before login)
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await Promise.all([
          ...CONNECTION_SETTINGS.map(setting =>
            invoke('set_secret', { key: setting.urlKeychainKey, value: connectionUrls[setting.id] })
          ),
          ...CONNECTION_SETTINGS.flatMap(setting =>
            (setting.credentialFields ?? [])
              .map(field => ({ field, value: connectionCredentials[setting.id]?.[field.keychainKey]?.trim() ?? '' }))
              .filter(({ field, value }) => value || !field.secret)
              .map(({ field, value }) => invoke('set_secret', { key: field.keychainKey, value }))
          ),
          bindHost ? invoke('set_secret', { key: 'mc-bind.host', value: bindHost }) : Promise.resolve(),
          agentKey ? invoke('set_secret', { key: 'mc-agent.key', value: agentKey }) : Promise.resolve(),
        ]).catch(() => {
          // Keychain save is best-effort — API save is the source of truth
        })
      }

      // Save expected hostnames to user preferences
      const nextPreferences = Object.fromEntries(
        CONNECTION_SETTINGS.map(setting => [setting.expectedHostPreferenceKey, expectedHosts[setting.id]])
      )
      await api.patch('/api/user-preferences', {
        preferences: nextPreferences,
      }).catch(() => {})

      setConnSaveStatus('Saved & encrypted. Restart to apply changes.')
    } catch (e: unknown) {
      setConnSaveStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConnSaving(false)
    }
  }, [agentKey, bindHost, connectionCredentials, connectionUrls, expectedHosts, saveSecretMutation, savedCredentials])

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
    background: s === 'ok' ? 'var(--secondary)' : s === 'not_configured' ? 'var(--text-muted)' : 'var(--red)',
  })
  const statusLabel = (r?: { status: string; latency_ms?: number; error?: string; peer_hostname?: string; peer_verified?: boolean }) => {
    if (!r) return null
    const parts: React.ReactNode[] = []
    if (r.status === 'ok') parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--secondary)', fontFamily: 'monospace' }}><span style={statusDot('ok')} />OK ({r.latency_ms}ms)</span>)
    else if (r.status === 'not_configured') parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}><span style={statusDot('not_configured')} />Not configured</span>)
    else parts.push(<span key="s" style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'monospace' }}><span style={statusDot('error')} />{r.error || r.status}</span>)
    // Peer verification badge
    if (r.peer_verified === true) {
      parts.push(<span key="pv" style={{ fontSize: '10px', color: 'var(--secondary)', fontFamily: 'monospace', marginLeft: '8px' }} title={`Peer: ${r.peer_hostname}`}>peer ok</span>)
    } else if (r.peer_verified === false) {
      parts.push(<span key="pv" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--gold)', fontFamily: 'monospace', marginLeft: '8px' }} title={`Peer hostname "${r.peer_hostname}" does not match expected`}><Warning size={11} />peer mismatch</span>)
    } else if (r.peer_hostname) {
      parts.push(<span key="pv" style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: '8px' }} title="No expected hostname configured">peer: {r.peer_hostname}</span>)
    }
    return <>{parts}</>
  }
  const hostInputStyle: React.CSSProperties = { ...inputStyle, width: '140px', fontSize: '11px' }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '(not set)'
  const normalizedBackendUrl = backendUrl.trim().replace(/\/+$/, '')
  const activeBackendUrl = backendStatus?.backend_public_base_url || normalizedBackendUrl
  const harnessStatus = backendStatus?.services.harness
  const agentSecretsStatus = backendStatus?.services.agentsecrets
  const backendReady = !!backendStatus?.services.supabase.reachable && harnessStatus?.reachable === true && agentSecretsStatus?.reachable === true
  const backendNeedsPairing = backendStatus?.pairing_required === true
  const backendSummary = backendStatus
    ? backendNeedsPairing
      ? 'Backend reachable, pairing required'
      : backendReady
        ? 'Backend ready'
        : 'Backend reachable, some core services still need work'
    : backendChecking
      ? 'Checking backend...'
      : 'No backend status yet'
  const harnessDetail = harnessStatus?.message
    ? ` (${harnessStatus.message})`
    : harnessStatus?.status
      ? ` (${harnessStatus.status})`
      : ''
  const backendDetails = backendStatus
    ? `Supabase ${backendStatus.services.supabase.reachable ? 'online' : backendStatus.services.supabase.configured ? 'configured but offline' : 'not configured'} • Harness ${harnessStatus?.reachable ? 'online' : harnessStatus?.configured ? 'configured but offline' : 'not configured'}${harnessDetail} • Agent Secrets ${agentSecretsStatus?.reachable ? 'online' : agentSecretsStatus?.configured ? 'configured but offline' : 'not configured'} • MemD ${backendStatus.services.memd.reachable ? 'online' : backendStatus.services.memd.configured ? 'configured but offline' : 'offline'}`
    : 'Run a backend check to validate the selected server.'
  const missingLabels: Record<string, string> = {
    harness: 'Harness',
    harness_auth: 'Harness auth',
    agentsecrets: 'Agent Secrets',
    supabase: 'Supabase',
    memd: 'memd',
  }

  return (
    <div>
      {isDemoMode() && (<div style={{ background: 'var(--warning-a08)', border: '1px solid var(--warning-a25)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Warning size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} /><span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--warning)' }}>You're in demo mode</span></div><p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>No services are connected. The app is showing sample data so you can explore the interface. To use real data, set the following environment variables and restart:</p><div style={{ background: 'var(--overlay-light)', borderRadius: '6px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.8 }}><div><span style={{ color: 'var(--accent)' }}>VITE_SUPABASE_URL</span>=https://your-project.supabase.co</div><div><span style={{ color: 'var(--accent)' }}>VITE_SUPABASE_ANON_KEY</span>=your-anon-key</div></div><p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>Then configure BlueBubbles and Harness below (saved to OS keychain).</p></div>)}
      <div style={sectionLabel}>Service Connections</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Configure URLs for external services. Credentials are encrypted and stored in Supabase with a local keychain fallback.
        Set expected Tailscale hostnames to verify peer identity.
      </p>

      <div style={{ ...sectionLabel, marginTop: '0' }}>Backend Server</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Choose which server this desktop app should use for auth, setup, and data. Check it first, then save or pair it.
      </p>

      <div style={row}>
        <div style={{ flex: 1 }}>
          <span>Backend URL</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>The server clawctrl will talk to.</div>
        </div>
        <input
          style={inputStyle}
          value={backendUrl}
          onChange={e => setBackendUrl(e.target.value)}
          placeholder="https://your-backend.example.com"
          aria-label="Backend URL"
        />
      </div>

      <div style={row}>
        <div style={{ flex: 1 }}>
          <span>Pairing Token</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Only needed if this server requires device pairing.</div>
        </div>
        <input
          type="password"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }}
          value={pairingToken}
          onChange={e => setPairingToken(e.target.value)}
          placeholder="Paste pairing token"
          aria-label="Pairing token"
        />
      </div>

      <div style={rowLast}>
        <div style={{ flex: 1 }}>
          <span>Backend Status</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {backendSummary}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {backendDetails}
          </div>
          {backendStatus?.missing?.length ? (
            <div style={{ fontSize: '11px', color: 'var(--gold)', marginTop: '4px' }}>
              Missing: {backendStatus.missing.map(key => missingLabels[key] ?? key).join(', ')}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{ ...val, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeBackendUrl}
          </span>
          {backendStatusMessage && (
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: backendStatusMessage.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>
              {backendStatusMessage}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="secondary" onClick={() => void refreshBackendStatus()} disabled={backendChecking} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {backendChecking ? 'Checking...' : 'Check Server'}
        </Button>
        <Button variant="primary" onClick={() => void saveBackendTarget()} disabled={backendSaving} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {backendSaving ? 'Saving...' : 'Save Server'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => void handlePairBackend()}
          disabled={backendPairing || backendStatus?.pairing_required !== true}
          style={{ fontSize: '12px', padding: '8px 16px', color: 'var(--text-secondary)' }}
        >
          {backendPairing ? 'Pairing...' : 'Pair Device'}
        </Button>
      </div>

      {CONNECTION_SETTINGS.map(setting => (
        <div key={setting.id} style={row}>
          <div style={{ flex: 1 }}>
            <span>{setting.label}</span>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{setting.description}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <input
              style={inputStyle}
              value={connectionUrls[setting.id]}
              onChange={e => updateConnectionUrl(setting.id, e.target.value)}
              placeholder={setting.urlPlaceholder}
              aria-label={`${setting.label} URL`}
            />
            {(setting.credentialFields ?? []).map(field => {
              const credKey = keychainKeyToCredKey(field.keychainKey)
              const hasSavedSecret = field.secret && !!savedCredentials[setting.id]?.[credKey]
              return (
                <input
                  key={field.keychainKey}
                  type={field.secret ? 'password' : field.type || 'text'}
                  style={{ ...inputStyle, fontFamily: field.secret ? 'monospace' : inputStyle.fontFamily, fontSize: '11px' }}
                  value={connectionCredentials[setting.id]?.[field.keychainKey] ?? ''}
                  onChange={e => updateConnectionCredential(setting.id, field.keychainKey, e.target.value)}
                  placeholder={hasSavedSecret ? `${field.label} saved; paste new value to replace` : field.placeholder}
                  aria-label={`${setting.label} ${field.label}`}
                />
              )
            })}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Expected host:</span>
              <input
                style={hostInputStyle}
                value={expectedHosts[setting.id]}
                onChange={e => updateExpectedHost(setting.id, e.target.value)}
                placeholder={setting.expectedHostPlaceholder}
                aria-label={`${setting.label} expected Tailscale hostname`}
              />
            </div>
            {connResults?.[setting.id] && statusLabel(connResults[setting.id])}
          </div>
        </div>
      ))}

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
        <Button variant="primary" onClick={saveConnections} disabled={connSaving} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {connSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={testConnections} disabled={connTesting} style={{ fontSize: '12px', padding: '8px 16px' }}>
          {connTesting ? 'Testing...' : 'Test All'}
        </Button>
        {connSaveStatus && (
          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: connSaveStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>
            {connSaveStatus}
          </span>
        )}
      </div>

      <div style={{ ...sectionLabel, marginTop: '24px' }}>Server Access</div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Allow external agents to reach the clawctrl API over Tailscale. Requires restart.
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => {
                // Re-run walkthrough/tour without resetting setup
                localStorage.removeItem('tour-progress')
                // Tour feature will be added in a later plan
              }}
              style={{ fontSize: '12px', padding: '8px 16px', color: 'var(--text-secondary)' }}
            >
              Re-run Walkthrough
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowResetConfirm(true)}
              style={{ fontSize: '12px', padding: '8px 16px' }}
            >
              Re-run Setup
            </Button>
          </div>
        </div>
        {/* Confirmation dialog for re-run setup */}
        {showResetConfirm && (
          <div style={{
            marginTop: '12px',
            padding: '12px 16px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              This will restart the setup wizard. Your current services and modules won't change.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                onClick={() => setShowResetConfirm(false)}
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowResetConfirm(false)
                  resetSetupWizard()
                  window.location.reload()
                }}
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                Restart
              </Button>
            </div>
          </div>
        )}
      </div>
      {showSetupWizard && (
        <Suspense fallback={null}>
          <OnboardingWelcome forceOpen onClose={() => setShowSetupWizard(false)} />
        </Suspense>
      )}
    </div>
  )
}
