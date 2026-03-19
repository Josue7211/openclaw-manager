import { memo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Desktop, WifiHigh, Database, Info, ArrowsClockwise, Clock, HardDrive, Stack, Monitor } from '@phosphor-icons/react'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

// ── Types ────────────────────────────────────────────────────────────────────

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
  background: online ? 'var(--green-500)' : 'var(--red-500)',
  boxShadow: online ? '0 0 6px rgba(34,197,94,0.4)' : '0 0 6px rgba(239,68,68,0.4)',
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

// ── Main component ───────────────────────────────────────────────────────────

export default memo(function SettingsStatus() {
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
            <Desktop size={14} />
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
            <WifiHigh size={14} />
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
            <StatusStatCard label="Active Fetches" value={allQueries.filter(q => q.state.fetchStatus === 'fetching').length} accent="var(--green-500)" />
          </div>
        </div>
      </div>
    </div>
  )
})
