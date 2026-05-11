import { useEffect, useState } from 'react'
import { Desktop } from '@phosphor-icons/react'
import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { api } from '@/lib/api'

import type { ApiSuccess, HomelabConfigData, HomelabData } from './homelab/types'
import { formatUptime, formatBytes, cpuColor } from './homelab/helpers'
import { CpuBar, MemBar, StatusDot, card, label, sectionTitle } from './homelab/components'

interface AuthSessionData {
  authenticated?: boolean
  mfa_required?: boolean
  mfa_verified?: boolean
}

type SyncStatus = 'checking' | 'ready' | 'signed-out' | 'mfa' | 'unknown'

function sourceLabel(source?: string): string {
  if (source === 'api') return 'API'
  if (source === 'ssh') return 'SSH'
  return source ? source.toUpperCase() : 'fallback'
}

function isHomeLabDemoMode(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('demo-mode') === 'true'
  } catch {
    return false
  }
}

export default function HomelabPage() {
  const demo = isHomeLabDemoMode()
  const { data, isLoading: loading, error, refetch, dataUpdatedAt } = useTauriQuery<HomelabData>(
    ['homelab'],
    '/api/homelab',
    { refetchInterval: demo ? false : 30000, enabled: !demo },
  )

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null
  const proxmoxLive = data?.live?.proxmox ?? (data ? !data.mock_services?.proxmox && !data.mock : false)
  const opnsenseLive = data?.live?.opnsense ?? (data ? !data.mock_services?.opnsense && !data.mock : false)
  const anyLive = proxmoxLive || opnsenseLive
  const [configInfo, setConfigInfo] = useState<HomelabConfigData | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking')

  useEffect(() => {
    if (demo) return
    let cancelled = false

    async function loadConfig() {
      const localResponse = await api.get<ApiSuccess<HomelabConfigData>>('/api/homelab/config').catch(() => null)
      if (!cancelled) setConfigInfo(localResponse?.data ?? null)

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
    }

    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [demo])

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
        ? `Secrets ready${configInfo?.local.proxmox_token_id ? ` · ${configInfo.local.proxmox_token_id}` : ''}`
        : 'Secrets incomplete',
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
