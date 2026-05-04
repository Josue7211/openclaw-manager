import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Desktop } from '@phosphor-icons/react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'

import type { ApiSuccess, HomelabConfigData, HomelabData } from './homelab/types'
import { formatUptime, formatBytes, cpuColor } from './homelab/helpers'
import { CpuBar, MemBar, StatusDot, card, label, sectionTitle } from './homelab/components'

interface ConfigForm {
  proxmoxHost: string
  proxmoxTokenId: string
  proxmoxTokenSecret: string
  opnsenseHost: string
  opnsenseKey: string
  opnsenseSecret: string
}

interface SyncedSecret {
  credentials?: Record<string, string>
}

interface AuthSessionData {
  authenticated?: boolean
  mfa_required?: boolean
  mfa_verified?: boolean
}

type SyncStatus = 'checking' | 'ready' | 'signed-out' | 'mfa' | 'unknown'

const emptyConfigForm: ConfigForm = {
  proxmoxHost: '',
  proxmoxTokenId: '',
  proxmoxTokenSecret: '',
  opnsenseHost: '',
  opnsenseKey: '',
  opnsenseSecret: '',
}

function sourceLabel(source?: string): string {
  if (source === 'api') return 'API'
  if (source === 'ssh') return 'SSH'
  return source ? source.toUpperCase() : 'fallback'
}

export default function HomelabPage() {
  const demo = isDemoMode()
  const { data, isLoading: loading, error, refetch, dataUpdatedAt } = useTauriQuery<HomelabData>(
    ['homelab'],
    '/api/homelab',
    { refetchInterval: demo ? false : 30000, enabled: !demo },
  )

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null
  const proxmoxLive = data?.live?.proxmox ?? (data ? !data.mock_services?.proxmox && !data.mock : false)
  const opnsenseLive = data?.live?.opnsense ?? (data ? !data.mock_services?.opnsense && !data.mock : false)
  const anyLive = proxmoxLive || opnsenseLive
  const [configForm, setConfigForm] = useState<ConfigForm>(emptyConfigForm)
  const [configInfo, setConfigInfo] = useState<HomelabConfigData | null>(null)
  const [configSaving, setConfigSaving] = useState(false)
  const [configMessage, setConfigMessage] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking')

  const applyLocalConfig = useCallback((config: HomelabConfigData | null) => {
    if (!config) return
    setConfigInfo(config)
    setConfigForm(prev => ({
      ...prev,
      proxmoxHost: prev.proxmoxHost || config.local.proxmox_host || '',
      proxmoxTokenId: prev.proxmoxTokenId || config.local.proxmox_token_id || '',
      opnsenseHost: prev.opnsenseHost || config.local.opnsense_host || '',
    }))
  }, [])

  const loadSyncedCredentials = useCallback(async (service: 'proxmox' | 'opnsense') => {
    const response = await api.get<ApiSuccess<SyncedSecret>>(`/api/secrets/${service}`).catch(() => null)
    return response?.data?.credentials ?? null
  }, [])

  const putLocalConfig = useCallback(async (payload: Record<string, string>) => {
    const response = await api.put<ApiSuccess<HomelabConfigData>>('/api/homelab/config', payload)
    applyLocalConfig(response.data)
    return response.data
  }, [applyLocalConfig])

  useEffect(() => {
    if (demo) return
    let cancelled = false

    async function loadConfig() {
      const localResponse = await api.get<ApiSuccess<HomelabConfigData>>('/api/homelab/config').catch(() => null)
      if (!cancelled) applyLocalConfig(localResponse?.data ?? null)

      const session = await api.get<AuthSessionData>('/api/auth/session').catch(() => null)
      if (!cancelled) {
        if (!session) {
          setSyncStatus('unknown')
        } else if (!session.authenticated) {
          setSyncStatus('signed-out')
        } else if (session.mfa_required && !session.mfa_verified) {
          setSyncStatus('mfa')
        } else {
          setSyncStatus('ready')
        }
      }

      const [syncedProxmox, syncedOPNsense] = await Promise.all([
        loadSyncedCredentials('proxmox'),
        loadSyncedCredentials('opnsense'),
      ])

      const syncPayload: Record<string, string> = {}
      if (syncedProxmox) {
        if (syncedProxmox.host) syncPayload.proxmox_host = syncedProxmox.host
        if (syncedProxmox.token_id) syncPayload.proxmox_token_id = syncedProxmox.token_id
        if (syncedProxmox.token_secret) syncPayload.proxmox_token_secret = syncedProxmox.token_secret
      }
      if (syncedOPNsense) {
        if (syncedOPNsense.host) syncPayload.opnsense_host = syncedOPNsense.host
        if (syncedOPNsense.key) syncPayload.opnsense_key = syncedOPNsense.key
        if (syncedOPNsense.secret) syncPayload.opnsense_secret = syncedOPNsense.secret
      }

      if (!cancelled && Object.keys(syncPayload).length > 0) {
        setConfigForm(prev => ({
          ...prev,
          proxmoxHost: syncPayload.proxmox_host || prev.proxmoxHost,
          proxmoxTokenId: syncPayload.proxmox_token_id || prev.proxmoxTokenId,
          proxmoxTokenSecret: syncPayload.proxmox_token_secret || prev.proxmoxTokenSecret,
          opnsenseHost: syncPayload.opnsense_host || prev.opnsenseHost,
          opnsenseKey: syncPayload.opnsense_key || prev.opnsenseKey,
          opnsenseSecret: syncPayload.opnsense_secret || prev.opnsenseSecret,
        }))
      }

      const localMissing = !localResponse?.data?.api_configured.proxmox || !localResponse?.data?.api_configured.opnsense
      if (Object.keys(syncPayload).length > 0 && localMissing) {
        await putLocalConfig(syncPayload).catch(() => null)
        if (!cancelled) {
          setConfigMessage('Synced homelab credentials from Supabase to this machine.')
          void refetch()
        }
      }
    }

    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [applyLocalConfig, demo, loadSyncedCredentials, putLocalConfig, refetch])

  const updateConfig = useCallback((key: keyof ConfigForm, value: string) => {
    setConfigForm(prev => ({ ...prev, [key]: value }))
    setConfigMessage(null)
  }, [])

  const saveConfig = useCallback(async () => {
    setConfigSaving(true)
    setConfigMessage(null)
    try {
      const localPayload: Record<string, string> = {
        proxmox_host: configForm.proxmoxHost,
        proxmox_token_id: configForm.proxmoxTokenId,
        opnsense_host: configForm.opnsenseHost,
      }
      if (configForm.proxmoxTokenSecret.trim()) localPayload.proxmox_token_secret = configForm.proxmoxTokenSecret
      if (configForm.opnsenseKey.trim()) localPayload.opnsense_key = configForm.opnsenseKey
      if (configForm.opnsenseSecret.trim()) localPayload.opnsense_secret = configForm.opnsenseSecret

      await putLocalConfig(localPayload)

      const localSync = await api.post<ApiSuccess<{ synced: string[]; skipped: string[] }>>('/api/homelab/sync')
        .catch(() => null)
      const localSyncComplete = !!localSync
        && localSync.data.synced.includes('proxmox')
        && localSync.data.synced.includes('opnsense')

      const [existingProxmox, existingOPNsense] = localSync ? [null, null] : await Promise.all([
        loadSyncedCredentials('proxmox').catch(() => null),
        loadSyncedCredentials('opnsense').catch(() => null),
      ])
      const proxmoxCredentials: Record<string, string> = {
        ...(existingProxmox ?? {}),
        host: configForm.proxmoxHost.trim(),
        token_id: configForm.proxmoxTokenId.trim(),
      }
      if (configForm.proxmoxTokenSecret.trim()) proxmoxCredentials.token_secret = configForm.proxmoxTokenSecret.trim()
      const opnsenseCredentials: Record<string, string> = {
        ...(existingOPNsense ?? {}),
        host: configForm.opnsenseHost.trim(),
      }
      if (configForm.opnsenseKey.trim()) opnsenseCredentials.key = configForm.opnsenseKey.trim()
      if (configForm.opnsenseSecret.trim()) opnsenseCredentials.secret = configForm.opnsenseSecret.trim()

      const directSyncAllowed = !localSync
        && !!(proxmoxCredentials.token_secret || configForm.proxmoxTokenSecret.trim())
        && !!(opnsenseCredentials.key || configForm.opnsenseKey.trim())
        && !!(opnsenseCredentials.secret || configForm.opnsenseSecret.trim())
      const syncResults = directSyncAllowed
        ? await Promise.allSettled([
            api.put('/api/secrets/proxmox', { credentials: proxmoxCredentials }),
            api.put('/api/secrets/opnsense', { credentials: opnsenseCredentials }),
          ])
        : []
      const syncOk = localSyncComplete || (directSyncAllowed && syncResults.every(result => result.status === 'fulfilled'))
      setConfigForm(prev => ({ ...prev, proxmoxTokenSecret: '', opnsenseKey: '', opnsenseSecret: '' }))
      setSyncStatus(syncOk ? 'ready' : 'signed-out')
      setConfigMessage(syncOk
        ? 'Saved locally and synced to Supabase.'
        : 'Saved locally. Supabase sync needs an authenticated backend session.')
      await refetch()
    } catch (err) {
      setConfigMessage(err instanceof Error ? err.message : 'Failed to save homelab configuration')
    } finally {
      setConfigSaving(false)
    }
  }, [configForm, loadSyncedCredentials, putLocalConfig, refetch])

  const localSecretsReady = !!configInfo?.api_configured.proxmox && !!configInfo?.api_configured.opnsense
  const allApiLive = !!data
    && proxmoxLive
    && opnsenseLive
    && data.proxmox.source === 'api'
    && data.opnsense.source === 'api'
  const fallbackActive = !!data && (data.proxmox.source === 'ssh' || data.opnsense.source === 'ssh' || !!data.mock)
  const syncStatusText = syncStatus === 'ready'
    ? 'Supabase ready'
    : syncStatus === 'mfa'
      ? 'Supabase MFA pending'
      : syncStatus === 'signed-out'
        ? 'Supabase signed out'
        : syncStatus === 'checking'
          ? 'Supabase checking'
          : 'Supabase unavailable'
  const runtimeNotes = [
    {
      label: 'Live path',
      value: allApiLive
        ? 'Proxmox and OPNsense are using API'
        : data
          ? `Proxmox ${sourceLabel(data.proxmox.source)} · OPNsense ${sourceLabel(data.opnsense.source)}`
          : 'Waiting for telemetry',
      tone: allApiLive ? 'ok' : 'warn',
    },
    {
      label: 'Local secrets',
      value: localSecretsReady
        ? `Keychain ready${configInfo?.local.proxmox_token_id ? ` · ${configInfo.local.proxmox_token_id}` : ''}`
        : 'Keychain incomplete',
      tone: localSecretsReady ? 'ok' : 'warn',
    },
    {
      label: 'Sync',
      value: syncStatusText,
      tone: syncStatus === 'ready' ? 'ok' : 'warn',
    },
    {
      label: 'Fallback',
      value: fallbackActive ? 'Fallback active' : 'Fallback idle',
      tone: fallbackActive ? 'warn' : 'ok',
    },
  ] as const

  const configInputStyle: CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontFamily: 'monospace',
  }

  const statusChip = (name: string, live: boolean, source?: string) => (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 8px',
      borderRadius: '999px',
      border: '1px solid var(--border)',
      background: live ? 'var(--secondary-a12)' : 'var(--bg-elevated)',
      color: live ? 'var(--secondary-bright)' : 'var(--text-muted)',
      fontSize: '11px',
      fontFamily: 'monospace',
    }}>
      <StatusDot status={live ? 'online' : 'offline'} />
      {name} {live ? sourceLabel(source) : 'offline'}
    </span>
  )

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>🖥️</span>
            <PageHeader defaultTitle="Home Lab Vitals" defaultSubtitle="Proxmox + OPNsense infrastructure health" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {data && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {statusChip('Proxmox', proxmoxLive, data.proxmox.source)}
              {statusChip('OPNsense', opnsenseLive, data.opnsense.source)}
            </div>
          )}
          {lastUpdated && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => refetch()}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && !demo && (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '13px' }}>
          Loading infrastructure data...
        </div>
      )}

      {demo && (
        <div style={{
          marginBottom: '20px', padding: '20px 24px',
          background: 'var(--blue-a08)',
          border: '1px solid var(--blue-a25)',
          borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Desktop size={18} style={{ color: 'var(--blue-solid)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--blue-solid)' }}>Homelab not configured</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Connect your Proxmox and OPNsense instances in Settings to monitor infrastructure health.
          </p>
        </div>
      )}

      {!demo && error && (
        <ErrorState resource="homelab" onRetry={() => refetch()} />
      )}

      {data?.mock && !anyLive && (
        <div style={{
          marginBottom: '20px', padding: '20px 24px',
          background: 'var(--blue-a08)',
          border: '1px solid var(--blue-a25)',
          borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px' }}>🖥️</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--blue-solid)' }}>Homelab not configured</span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Showing demo data. Add the following to <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>.env.local</code> and restart:
          </p>
          <pre style={{ margin: '0', padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)', overflowX: 'auto', lineHeight: 1.8 }}>
{`PROXMOX_HOST=https://your-proxmox-ip:8006
PROXMOX_TOKEN_ID=user@pam!token-name
PROXMOX_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

OPNSENSE_HOST=https://your-opnsense-ip
OPNSENSE_KEY=your-api-key
OPNSENSE_SECRET=your-api-secret`}
          </pre>
        </div>
      )}

      {data?.mock && anyLive && (
        <div style={{
          marginBottom: '20px', padding: '14px 18px',
          background: 'var(--gold-a12)',
          border: '1px solid var(--gold-a25)',
          borderRadius: '12px',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          lineHeight: 1.6,
        }}>
          Live data is connected for {proxmoxLive ? 'Proxmox' : 'OPNsense'}.
          {' '}
          {proxmoxLive ? 'OPNsense' : 'Proxmox'} is still using fallback data until its host and API credentials are saved.
        </div>
      )}

      {!demo && (
        <div style={{ ...card, marginBottom: '24px', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Homelab Connections
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Local: Proxmox {configInfo?.api_configured.proxmox ? 'ready' : 'needs API token'} · OPNsense {configInfo?.api_configured.opnsense ? 'ready' : 'needs API key'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {configMessage && (
                <span style={{
                  maxWidth: '420px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '11px',
                  color: configMessage.includes('Failed') || configMessage.includes('needs') ? 'var(--gold)' : 'var(--secondary)',
                  fontFamily: 'monospace',
                }}>
                  {configMessage}
                </span>
              )}
              <Button variant="secondary" onClick={() => setSetupOpen(open => !open)}>
                {setupOpen ? 'Hide Setup' : 'Setup'}
              </Button>
              <Button variant="primary" onClick={saveConfig} disabled={configSaving}>
                {configSaving ? 'Saving...' : 'Save + Sync'}
              </Button>
            </div>
          </div>

          {setupOpen && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '18px',
              marginTop: '16px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={sectionTitle}>Proxmox</div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Host URL
                  <input
                    style={configInputStyle}
                    value={configForm.proxmoxHost}
                    onChange={event => updateConfig('proxmoxHost', event.target.value)}
                    placeholder="https://pve.example:8006"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Token ID
                  <input
                    style={configInputStyle}
                    value={configForm.proxmoxTokenId}
                    onChange={event => updateConfig('proxmoxTokenId', event.target.value)}
                    placeholder="user@pam!token-name"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Token Secret {configInfo?.local.proxmox_token_secret_set ? '(saved)' : ''}
                  <input
                    style={configInputStyle}
                    type="password"
                    value={configForm.proxmoxTokenSecret}
                    onChange={event => updateConfig('proxmoxTokenSecret', event.target.value)}
                    placeholder={configInfo?.local.proxmox_token_secret_set ? 'leave blank to keep saved secret' : 'token secret'}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={sectionTitle}>OPNsense</div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Host URL
                  <input
                    style={configInputStyle}
                    value={configForm.opnsenseHost}
                    onChange={event => updateConfig('opnsenseHost', event.target.value)}
                    placeholder="https://opnsense.example"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  API Key {configInfo?.local.opnsense_key_set ? '(saved)' : ''}
                  <input
                    style={configInputStyle}
                    type="password"
                    value={configForm.opnsenseKey}
                    onChange={event => updateConfig('opnsenseKey', event.target.value)}
                    placeholder={configInfo?.local.opnsense_key_set ? 'leave blank to keep saved key' : 'api key'}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  API Secret {configInfo?.local.opnsense_secret_set ? '(saved)' : ''}
                  <input
                    style={configInputStyle}
                    type="password"
                    value={configForm.opnsenseSecret}
                    onChange={event => updateConfig('opnsenseSecret', event.target.value)}
                    placeholder={configInfo?.local.opnsense_secret_set ? 'leave blank to keep saved secret' : 'api secret'}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
            {runtimeNotes.map(note => (
              <div key={note.label} style={{
                ...card,
                padding: '12px 14px',
                minHeight: '74px',
                borderColor: note.tone === 'ok' ? 'var(--secondary-a25)' : 'var(--gold-a25)',
                background: note.tone === 'ok' ? 'var(--secondary-a06)' : 'var(--gold-a08)',
              }}>
                <div style={label}>{note.label}</div>
                <div style={{
                  marginTop: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  lineHeight: 1.35,
                  fontFamily: 'monospace',
                }}>
                  {note.value}
                </div>
              </div>
            ))}
          </div>

          {/* Proxmox Section */}
          <div>
            <div style={sectionTitle}>
              <span style={{ color: 'var(--accent)' }}>◈</span> Proxmox Hypervisor
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Node Cards */}
              {data.proxmox.nodes.map(node => (
                <div key={node.name} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <StatusDot status={node.status} />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
                      {node.name}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: node.status === 'online' ? 'var(--secondary-a15)' : 'var(--red-500-a12)',
                      color: node.status === 'online' ? 'var(--secondary-bright)' : 'var(--red-bright)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {node.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <div style={label}>CPU Usage</div>
                      <CpuBar value={node.cpu} />
                    </div>
                    <div>
                      <div style={label}>Memory</div>
                      <MemBar used={node.mem_used} total={node.mem_total} />
                    </div>
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <div>
                        <div style={label}>Uptime</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {formatUptime(node.uptime)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* VM List Card */}
              <div style={{ ...card, gridColumn: data.proxmox.nodes.length === 1 ? '2' : '1 / -1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                    Virtual Machines & Containers
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {data.proxmox.vms.filter(v => v.status === 'running').length}/{data.proxmox.vms.length} running
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.proxmox.vms.map(vm => (
                    <div key={vm.name} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                    }}>
                      <StatusDot status={vm.status} />
                      <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {vm.name}
                      </span>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        {vm.kind && (
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: 'var(--bg-subtle)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-muted)',
                            fontFamily: 'monospace',
                            textTransform: 'uppercase',
                          }}>
                            {vm.kind === 'qemu' ? 'VM' : vm.kind}
                          </span>
                        )}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>CPU</div>
                          <div style={{ fontSize: '12px', color: cpuColor(vm.cpu), fontFamily: 'monospace' }}>
                            {Math.round(vm.cpu * 100)}%
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>RAM</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {formatBytes(vm.mem)}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          background: vm.status === 'running' ? 'var(--secondary-a12)' : 'var(--red-500-a12)',
                          color: vm.status === 'running' ? 'var(--secondary-bright)' : 'var(--red-bright)',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase',
                        }}>
                          {vm.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {data.proxmox.vms.length === 0 && (
                    <div style={{ padding: '16px 0' }}>
                      <EmptyState icon={Desktop} title="No VMs found" description="Connect to your Proxmox server in Settings." />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* OPNsense Section */}
          <div>
            <div style={sectionTitle}>
              <span style={{ color: 'var(--tertiary)' }}>◈</span> OPNsense Router
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>

              {/* Status Card */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <StatusDot status={data.opnsense.status} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
                    Router
                  </span>
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: data.opnsense.status === 'online' ? 'var(--secondary-a15)' : 'var(--red-500-a12)',
                    color: data.opnsense.status === 'online' ? 'var(--secondary-bright)' : 'var(--red-bright)',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                  }}>
                    {data.opnsense.status}
                  </span>
                </div>
                <div>
                  <div style={label}>Uptime</div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {formatUptime(data.opnsense.uptime)}
                  </div>
                </div>
              </div>

              {/* CPU + RAM Card */}
              <div style={card}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', marginBottom: '16px' }}>
                  Resources
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={label}>CPU</div>
                    <CpuBar value={data.opnsense.cpu} />
                  </div>
                  <div>
                    <div style={label}>Memory</div>
                    <MemBar used={data.opnsense.mem_used} total={data.opnsense.mem_total} />
                  </div>
                </div>
              </div>

              {/* WAN Traffic Card */}
              <div style={card}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', marginBottom: '16px' }}>
                  WAN Traffic
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={label}>Inbound</div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--secondary-bright)', fontFamily: 'monospace' }}>
                      ↓ {data.opnsense.wan_in}
                    </div>
                  </div>
                  <div>
                    <div style={label}>Outbound</div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent)', fontFamily: 'monospace' }}>
                      ↑ {data.opnsense.wan_out}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  )
}
