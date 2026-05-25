import { memo, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Desktop, WifiHigh, Database, Info, ArrowsClockwise, Clock, HardDrive, Stack, Monitor, Plugs, Key } from '@phosphor-icons/react'

import {
  api,
  CONFIGURED_BACKEND_BASE_CHANGED_EVENT,
  getConfiguredBackendBase,
} from '@/lib/api'
import { getSetupStatus } from '@/lib/setup'
import { queryKeys } from '@/lib/query-keys'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGatewayStatus } from '@/hooks/sessions/useGatewayStatus'
import {
  approveTrustedDeviceHandoff,
  generateRecoveryKey,
  getAccountSyncStatus,
  getRecoveryKeyStatus,
  hydrateAccountSync,
  listTrustedDeviceHandoffs,
  type AccountSyncStatus,
  type AccountSyncServiceDetail,
  type HandoffRequest,
  type RecoveryStatus,
} from '@/lib/account-sync'

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  status: string
  latency_ms?: number
  error?: string
  message?: string
  peer_hostname?: string
  peer_verified?: boolean
}

interface AppleSyncProbe {
  status: string
  step?: string
  error?: string
  message?: string
  created?: boolean
  listed?: boolean
  completed?: boolean
  deleted?: boolean
}

interface AppleSyncVerification {
  ok: boolean
  calendar?: AppleSyncProbe
  reminders?: AppleSyncProbe
  caveat?: string
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
    bluebubbles_private_api?: ServiceStatus
    messages?: ServiceStatus
    mac_bridge?: ServiceStatus
    calendar?: ServiceStatus
    reminders?: ServiceStatus
    harness?: ServiceStatus
    agentsecrets?: ServiceStatus
    agentshell?: ServiceStatus
    memd?: ServiceStatus
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

interface SetupStatusData {
  ok: boolean
  backend_public_base_url: string
  pairing_required: boolean
	  capabilities: {
	    google_oauth: boolean
	    github_oauth: boolean
	    harness?: boolean
    agentsecrets?: boolean
    memd: boolean
  }
	  services: {
	    supabase: SetupServiceState
	    harness?: SetupServiceState
    agentsecrets?: SetupServiceState
    memd: SetupServiceState
  }
  missing: string[]
}

interface SetupServiceState {
  configured: boolean
  reachable: boolean
  status?: string
  auth_configured?: boolean
  auth_valid?: boolean
  auth_source?: string
  checked_path?: string | null
  message?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    case 'ok': return 'var(--secondary-dim)'
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

function setupReadinessLabel(setupStatus: SetupStatusData): string {
  if (setupStatus.pairing_required) return 'Needs pairing'
  if (setupStatus.missing.length === 0) return 'Ready'
  return 'Needs setup'
}

function setupReadinessColor(setupStatus: SetupStatusData): string {
  if (setupStatus.pairing_required) return 'var(--amber)'
  if (setupStatus.missing.length === 0) return 'var(--secondary-dim)'
  return 'var(--amber)'
}

function formatMissingSetup(missing: string[]): string {
  if (missing.length === 0) return 'Everything required is configured'
  const labels: Record<string, string> = {
	    harness: 'Hermes Agent',
	    harness_auth: 'Hermes Agent auth',
    agentsecrets: 'Agent Secrets',
    supabase: 'Supabase',
    memd: 'memd',
  }
  return `Missing: ${missing.map((key) => labels[key] ?? key).join(', ')}`
}

// ── Styles ───────────────────────────────────────────────────────────────────

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
  background: online ? 'var(--secondary-dim)' : 'var(--red-500)',
  boxShadow: online ? '0 0 6px var(--secondary-a30)' : '0 0 6px var(--red-500-a25)',
  flexShrink: 0,
})

// ── Sub-components ───────────────────────────────────────────────────────────

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

function syncStatusColor(status: AccountSyncServiceDetail['status']): string {
  switch (status) {
    case 'ready': return 'var(--secondary-dim)'
    case 'synced': return 'var(--blue)'
    case 'local_only': return 'var(--amber)'
    case 'partial': return 'var(--amber)'
    case 'locked': return 'var(--yellow)'
    case 'needs_repair': return 'var(--red-500)'
    default: return 'var(--text-muted)'
  }
}

function syncStatusLabel(service: AccountSyncServiceDetail): string {
  switch (service.status) {
    case 'ready': return 'Ready'
    case 'synced': return 'Synced'
    case 'local_only': return 'Local only'
    case 'partial': return 'Missing fields'
    case 'locked': return 'Locked'
    case 'needs_repair': return 'Needs repair'
    default: return 'Unknown'
  }
}

function formatServiceDetail(service: AccountSyncServiceDetail): string {
  if (service.status === 'locked') return 'Unlock account sync to hydrate locally'
  if (service.missing_fields.length > 0) return `Missing ${service.missing_fields.join(', ')}`
  if (service.synced && service.hydrated) return service.updated_at ? `Synced ${new Date(service.updated_at).toLocaleString()}` : 'Synced and hydrated'
  if (service.status === 'local_only') return 'Available locally, not saved to account yet'
  if (service.configured_fields.length > 0) return `${service.configured_fields.length} fields synced`
  return 'No synced credential fields detected'
}

// ── Main component ───────────────────────────────────────────────────────────

export default memo(function SettingsStatus() {
  const queryClient = useQueryClient()
  const [backendBase, setBackendBase] = useState(getConfiguredBackendBase())
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const [appleSyncResult, setAppleSyncResult] = useState<AppleSyncVerification | null>(null)

  const { data: health, isLoading: healthLoading, isError: healthError, dataUpdatedAt: healthUpdatedAt } = useQuery<HealthData>({
    queryKey: queryKeys.health,
    queryFn: () => api.get('/api/status/health'),
    refetchInterval: 10_000,
    staleTime: 8_000,
  })

  const { data: tailscale, isLoading: tsLoading, isError: tsError } = useQuery<TailscaleData>({
    queryKey: queryKeys.tailscalePeers,
    queryFn: () => api.get('/api/status/tailscale'),
    refetchInterval: 10_000,
    staleTime: 8_000,
  })

  const { data: setupStatus, isLoading: setupLoading, isError: setupError } = useQuery<SetupStatusData>({
    queryKey: ['setup-status', backendBase],
    queryFn: () => getSetupStatus(backendBase),
    refetchInterval: 10_000,
    staleTime: 8_000,
  })

  const { data: handoffs } = useQuery<{ ok: boolean; requests: HandoffRequest[] }>({
    queryKey: ['account-sync-handoffs'],
    queryFn: () => listTrustedDeviceHandoffs(),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  })

  const {
    data: accountSync,
    isLoading: syncLoading,
    isError: syncError,
    refetch: refetchAccountSync,
  } = useQuery<AccountSyncStatus>({
    queryKey: ['account-sync-status'],
    queryFn: () => getAccountSyncStatus(),
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  })

  const { data: recoveryStatus } = useQuery<RecoveryStatus>({
    queryKey: ['account-sync-recovery-status'],
    queryFn: () => getRecoveryKeyStatus(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  })

  const restartMacBridge = useMutation({
    mutationFn: () => api.post('/api/status/mac-bridge/restart', {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.health })
    },
  })

  const verifyAppleSync = useMutation({
    mutationFn: () => api.post<AppleSyncVerification>('/api/status/apple-sync/verify', {
      calendar: true,
      reminders: true,
      cleanup: true,
    }),
    onSuccess: async (result) => {
      setAppleSyncResult(result)
      await queryClient.invalidateQueries({ queryKey: queryKeys.health })
    },
    onError: (error) => {
      const message = error instanceof Error && error.message ? error.message : 'Apple sync verification failed.'
      setAppleSyncResult({
        ok: false,
        calendar: { status: 'failed', error: message },
        reminders: { status: 'failed', error: message },
      })
    },
  })

  useEffect(() => {
    const onBackendChanged = () => {
      const nextBase = getConfiguredBackendBase()
      setBackendBase(nextBase)
      void queryClient.invalidateQueries({ queryKey: ['setup-status'] })
    }

    window.addEventListener(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, onBackendChanged)
    return () => window.removeEventListener(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, onBackendChanged)
  }, [queryClient])

  const { status: gwStatus, connected: gwConnected, protocol: gwProtocol, reconnectAttempt } = useGatewayStatus()

  // Compute gateway display text
  const gwDisplayStatus = gwConnected
    ? `Connected${gwProtocol ? ` (protocol v${gwProtocol})` : ''}`
    : gwStatus === 'reconnecting'
      ? `Reconnecting${reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt})` : '...'}`
      : gwStatus === 'not_configured'
        ? 'Not configured'
        : 'Disconnected'

  const gwDotColor = gwConnected
    ? 'var(--secondary-dim)'
    : gwStatus === 'reconnecting'
      ? 'var(--amber)'
      : gwStatus === 'not_configured'
        ? 'var(--text-muted)'
        : 'var(--red-500)'

  const queryCache = queryClient.getQueryCache()
  const allQueries = queryCache.getAll()
  const staleQueries = allQueries.filter(q => q.isStale())

  const lastRefresh = healthUpdatedAt
    ? new Date(healthUpdatedAt).toLocaleTimeString()
    : '--'

  const services = health?.services
  const serviceEntries: { key: string; label: string; data: ServiceStatus | undefined }[] = [
    { key: 'messages', label: 'Messages', data: services?.messages ?? services?.bluebubbles },
    { key: 'bluebubbles_private_api', label: 'BlueBubbles Private API', data: services?.bluebubbles_private_api },
    { key: 'calendar', label: 'Calendar', data: services?.calendar },
    { key: 'reminders', label: 'Reminders', data: services?.reminders },
    { key: 'mac_bridge', label: 'Mac Bridge', data: services?.mac_bridge },
    { key: 'agentshell', label: 'Agent Shell', data: services?.agentshell },
    { key: 'agentsecrets', label: 'Agent Secrets', data: services?.agentsecrets },
    { key: 'memd', label: 'memd', data: services?.memd },
    { key: 'harness', label: 'Hermes Agent', data: services?.harness },
    { key: 'supabase', label: 'Supabase', data: services?.supabase },
  ]
  const pendingHandoffs = handoffs?.requests ?? []

  async function handleGenerateRecoveryKey() {
    setRecoveryBusy(true)
    setRecoveryError('')

    try {
      const result = await generateRecoveryKey()
      setGeneratedRecoveryKey(result.recovery_key)
      await queryClient.invalidateQueries({ queryKey: ['account-sync-recovery-status'] })
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Could not generate a recovery key.'
      setRecoveryError(message)
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function handleHydrateAccountSync() {
    setRecoveryBusy(true)
    setRecoveryError('')

    try {
      await hydrateAccountSync()
      await Promise.all([
        refetchAccountSync(),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
        queryClient.invalidateQueries({ queryKey: ['setup-status'] }),
      ])
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Could not hydrate synced services.'
      setRecoveryError(message)
    } finally {
      setRecoveryBusy(false)
    }
  }

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
        {/* Release Backend */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Desktop size={14} />
            Release Backend
          </div>
          {setupLoading ? (
            <StatusLoadingSkeleton rows={4} />
          ) : setupError || !setupStatus ? (
            <div style={{ padding: '12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Backend setup status unavailable.
            </div>
          ) : (
            <>
              <div style={statusRow}>
                <span>Server</span>
                <span style={{ ...statusVal, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {setupStatus.backend_public_base_url}
                </span>
              </div>
              <div style={statusRow}>
                <span>Readiness</span>
                <span style={{ ...statusVal, color: setupReadinessColor(setupStatus) }}>
                  {setupReadinessLabel(setupStatus)}
                </span>
              </div>
              <div style={statusRow}>
                <span>Pairing</span>
                <span style={{ ...statusVal, color: setupStatus.pairing_required ? 'var(--amber)' : 'var(--secondary-dim)' }}>
                  {setupStatus.pairing_required ? 'Required before this app can connect' : 'Not required'}
                </span>
              </div>
              <div style={statusRowLast}>
                <span>Available services</span>
                <span style={{ ...statusVal, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatMissingSetup(setupStatus.missing)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Services */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Desktop size={14} />
            Services
          </div>
          {healthLoading ? (
            <StatusLoadingSkeleton rows={3} />
          ) : healthError || !services ? (
            <div style={{ padding: '12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              {healthError
                ? 'Unable to reach backend. Check that the Tauri app or dev server is running.'
                : 'Service status not available from the health endpoint.'}
            </div>
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
                    {svc.key === 'mac_bridge' && (
                      <button
                        type="button"
                        onClick={() => restartMacBridge.mutate()}
                        disabled={restartMacBridge.isPending}
                        title="Restart Mac Bridge"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-white-03)',
                          color: 'var(--text-muted)',
                          cursor: restartMacBridge.isPending ? 'wait' : 'pointer',
                        }}
                      >
                        <ArrowsClockwise
                          size={13}
                          style={{ animation: restartMacBridge.isPending ? 'spin 0.8s linear infinite' : 'none' }}
                        />
                      </button>
                    )}
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
          {setupStatus && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                OAuth: {setupStatus.capabilities.github_oauth ? 'GitHub on' : 'GitHub off'} • {setupStatus.capabilities.google_oauth ? 'Google on' : 'Google off'}
              </div>
            </div>
          )}
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Apple source round trip
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Calendar and Reminders create, list, delete through Mac Bridge.
                </div>
              </div>
              <button
                type="button"
                onClick={() => verifyAppleSync.mutate()}
                disabled={verifyAppleSync.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  background: verifyAppleSync.isPending ? 'var(--bg-white-04)' : 'var(--accent-solid)',
                  color: verifyAppleSync.isPending ? 'var(--text-muted)' : 'var(--text-on-color)',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '9px 12px',
                  cursor: verifyAppleSync.isPending ? 'wait' : 'pointer',
                }}
              >
                <ArrowsClockwise
                  size={14}
                  style={{ animation: verifyAppleSync.isPending ? 'spin 0.8s linear infinite' : 'none' }}
                />
                Verify
              </button>
            </div>
            {appleSyncResult && (
              <div style={{
                marginTop: '12px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                overflow: 'hidden',
                background: appleSyncResult.ok ? 'var(--secondary-a08)' : 'var(--red-500-a12)',
              }}>
                {[
                  ['Calendar', appleSyncResult.calendar],
                  ['Reminders', appleSyncResult.reminders],
                ].map(([label, probe], index) => {
                  const data = probe as AppleSyncProbe | undefined
                  const ok = data?.status === 'ok'
                  return (
                    <div
                      key={label as string}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 12px',
                        borderBottom: index === 0 ? '1px solid var(--border)' : 'none',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label as string}</span>
                      <span style={{ color: ok ? 'var(--secondary-dim)' : 'var(--red-500)', textAlign: 'right' }}>
                        {ok
                          ? 'created, listed, deleted'
                          : data?.message || data?.error || data?.step || data?.status || 'failed'}
                      </span>
                    </div>
                  )
                })}
                {appleSyncResult.caveat && (
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.45 }}>
                    {appleSyncResult.caveat}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {pendingHandoffs.length > 0 && (
          <div style={statusCard}>
            <div style={statusSectionTitle}>
              <Desktop size={14} />
              Account Sync Requests
            </div>
            {pendingHandoffs.map((request, i) => {
              const isLast = i === pendingHandoffs.length - 1
              return (
                <div key={request.id} style={isLast ? statusRowLast : statusRow}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 500 }}>{request.requesting_device_name}</span>
                    <span style={{ ...statusVal, fontSize: '11px' }}>
                      Code {request.verification_code || '------'} • Expires {new Date(request.expires_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await approveTrustedDeviceHandoff(request.id)
                      await queryClient.invalidateQueries({ queryKey: ['account-sync-handoffs'] })
                    }}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      background: 'var(--accent-solid)',
                      color: 'var(--text-on-color)',
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '7px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    Approve
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Plugs size={14} />
            Connected Services Sync
          </div>
          {syncLoading ? (
            <StatusLoadingSkeleton rows={4} />
          ) : syncError || !accountSync ? (
            <div style={{ padding: '12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Account sync status unavailable.
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginBottom: '14px',
              }}>
                <StatusStatCard label="Synced" value={accountSync.synced_service_count} />
                <StatusStatCard label="Hydrated" value={accountSync.hydrated_service_count ?? 0} accent="var(--secondary-dim)" />
                <StatusStatCard label="Needs Action" value={(accountSync.service_details ?? []).filter(s => s.status === 'locked' || s.status === 'partial' || s.status === 'needs_repair' || s.status === 'local_only').length} accent="var(--amber)" />
              </div>
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}>
                {(accountSync.service_details ?? []).length === 0 ? (
                  <div style={{ padding: '14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No account-synced services yet.
                  </div>
                ) : (
                  (accountSync.service_details ?? []).map((service, index, arr) => {
                    const color = syncStatusColor(service.status)
                    return (
                      <div
                        key={`${service.service}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(120px, 1fr) minmax(90px, auto)',
                          gap: '12px',
                          padding: '11px 12px',
                          borderBottom: index === arr.length - 1 ? 'none' : '1px solid var(--border)',
                          background: service.status === 'local_only' ? 'var(--warning-a08)' : 'transparent',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{
                              display: 'inline-block',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: color,
                              boxShadow: service.status === 'ready' ? `0 0 6px ${color}60` : 'none',
                              flexShrink: 0,
                            }} />
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                              {service.label}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.45 }}>
                            {formatServiceDetail(service)}
                          </div>
                        </div>
                        <div style={{ color, fontSize: '11px', fontWeight: 700, alignSelf: 'center', textAlign: 'right' }}>
                          {syncStatusLabel(service)}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => { void handleHydrateAccountSync() }}
                  disabled={recoveryBusy || accountSync.requires_unlock}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: recoveryBusy || accountSync.requires_unlock ? 'var(--bg-white-04)' : 'var(--accent-solid)',
                    color: recoveryBusy || accountSync.requires_unlock ? 'var(--text-muted)' : 'var(--text-on-color)',
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '9px 12px',
                    cursor: recoveryBusy || accountSync.requires_unlock ? 'default' : 'pointer',
                  }}
                >
                  {recoveryBusy ? 'Syncing...' : 'Hydrate Now'}
                </button>
                <button
                  type="button"
                  onClick={() => { void refetchAccountSync() }}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--bg-white-04)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '9px 12px',
                    cursor: 'pointer',
                  }}
                >
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>

        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Key size={14} />
            Account Sync Recovery
          </div>
          <div style={statusRow}>
            <span>Status</span>
            <span style={{
              ...statusVal,
              color: recoveryStatus?.configured ? 'var(--secondary-dim)' : 'var(--amber)',
            }}>
              {recoveryStatus?.configured ? 'Recovery key configured' : 'No recovery key'}
            </span>
          </div>
          <div style={statusRowLast}>
            <span>Last generated</span>
            <span style={statusVal}>
              {recoveryStatus?.latest?.created_at
                ? new Date(recoveryStatus.latest.created_at).toLocaleString()
                : '--'}
            </span>
          </div>
          {generatedRecoveryKey && (
            <div style={{
              marginTop: '14px',
              padding: '12px',
              border: '1px solid var(--accent-a20)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-a10)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                New recovery key
              </span>
              <code style={{
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                overflowWrap: 'anywhere',
                userSelect: 'all',
              }}>
                {generatedRecoveryKey}
              </code>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Shown once. Generate a new key if this one is misplaced.
              </span>
            </div>
          )}
          {recoveryError && (
            <div style={{
              marginTop: '12px',
              padding: '9px 10px',
              borderRadius: '8px',
              border: '1px solid var(--red-a15)',
              background: 'var(--red-a08)',
              color: 'var(--red)',
              fontSize: '12px',
            }}>
              {recoveryError}
            </div>
          )}
          <button
            type="button"
            onClick={() => { void handleGenerateRecoveryKey() }}
            disabled={recoveryBusy}
            style={{
              marginTop: '14px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: recoveryBusy ? 'var(--bg-white-04)' : 'var(--accent-solid)',
              color: recoveryBusy ? 'var(--text-muted)' : 'var(--text-on-color)',
              fontSize: '12px',
              fontWeight: 700,
              padding: '9px 12px',
              cursor: recoveryBusy ? 'default' : 'pointer',
              width: '100%',
            }}
          >
            {recoveryBusy ? 'Generating...' : 'Generate Recovery Key'}
          </button>
        </div>

        {/* Gateway WebSocket */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <Plugs size={14} />
            Gateway WebSocket
          </div>
          <div style={statusRowLast}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                background: gwDotColor,
                boxShadow: gwConnected
                  ? `0 0 6px ${gwDotColor}60`
                  : gwStatus === 'not_configured'
                    ? 'none'
                    : `0 0 6px var(--red-500-a25)`,
              }} />
	              <span style={{ fontWeight: 500 }}>Hermes Agent Gateway</span>
            </div>
            <span style={{
              fontSize: '11px', fontWeight: 500,
              color: gwDotColor,
            }}>
              {gwDisplayStatus}
            </span>
          </div>
        </div>

        {/* Tailscale Peers */}
        <div style={statusCard}>
          <div style={statusSectionTitle}>
            <WifiHigh size={14} />
            Tailscale Peers
          </div>
          {tsLoading ? (
            <StatusLoadingSkeleton rows={3} />
          ) : tsError ? (
            <div style={{ padding: '12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Unable to fetch Tailscale peers. The backend may not be authenticated or Tailscale may not be installed.
            </div>
          ) : uniquePeers.length === 0 ? (
            <div style={{ padding: '8px 0' }}>
              <EmptyState icon={WifiHigh} title="No peers found" description="Tailscale may not be installed or running." />
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
                      color: peer.online ? 'var(--secondary-dim)' : 'var(--red-500)',
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
          ) : healthError ? (
            <div style={{ padding: '12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Not available &mdash; backend unreachable.
            </div>
          ) : (
            <>
              <div style={statusRow}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Stack size={14} style={{ color: 'var(--text-muted)' }} />
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
                  {health?.sqlite_db_size_bytes != null ? formatBytes(health.sqlite_db_size_bytes) : '--'}
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
          ) : healthError ? (
            <div style={{ padding: '12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Not available &mdash; backend unreachable.
            </div>
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
                  {health?.uptime_seconds != null ? formatUptime(health.uptime_seconds) : '--'}
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
            <ArrowsClockwise size={14} />
            React Query Cache
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
          }}>
            <StatusStatCard label="Total Queries" value={allQueries.length} />
            <StatusStatCard label="Stale Queries" value={staleQueries.length} accent={staleQueries.length > 0 ? 'var(--yellow)' : undefined} />
            <StatusStatCard label="Active Fetches" value={allQueries.filter(q => q.state.fetchStatus === 'fetching').length} accent="var(--secondary-dim)" />
          </div>
        </div>
      </div>
    </div>
  )
})
