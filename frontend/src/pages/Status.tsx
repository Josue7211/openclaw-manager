import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import {
  HeartPulse,
  Server,
  Wifi,
  Database,
  Info,
  RefreshCw,
  Clock,
  HardDrive,
  Monitor,
  Layers,
} from 'lucide-react'

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

function statusColor(status: string): string {
  switch (status) {
    case 'ok':
      return 'var(--green-500)'
    case 'error':
    case 'degraded':
      return 'var(--yellow)'
    case 'unreachable':
      return 'var(--red-500)'
    case 'not_configured':
      return 'var(--text-muted)'
    default:
      return 'var(--text-muted)'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ok':
      return 'Connected'
    case 'error':
      return 'Error'
    case 'unreachable':
      return 'Unreachable'
    case 'not_configured':
      return 'Not Configured'
    default:
      return status
  }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px',
  backdropFilter: 'blur(12px)',
}

const sectionTitle: React.CSSProperties = {
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

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
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

const dotStyle = (online: boolean): React.CSSProperties => ({
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: online ? 'var(--green-500)' : 'var(--red-500)',
  boxShadow: online ? '0 0 6px rgba(34,197,94,0.4)' : '0 0 6px rgba(239,68,68,0.4)',
  flexShrink: 0,
})

// ── Component ────────────────────────────────────────────────────────────────

export default function Status() {
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

  // React Query cache introspection
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

  // Deduplicate Tailscale peers by hostname (multiple IPs per peer)
  const peers = tailscale?.peers ?? []
  const uniquePeers = peers.reduce<TailscalePeer[]>((acc, p) => {
    if (!acc.find(x => x.hostname === p.hostname)) acc.push(p)
    return acc
  }, [])

  return (
    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding: '32px 24px',
      animation: 'fadeIn 0.3s ease',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <HeartPulse size={24} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            System Status
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            Last refresh: {lastRefresh}
          </span>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto-refresh 10s</span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
        gap: '16px',
      }}>
        {/* ── Services ────────────────────────────────────────────────── */}
        <div style={card}>
          <div style={sectionTitle}>
            <Server size={14} />
            Services
          </div>
          {healthLoading ? (
            <LoadingSkeleton rows={3} />
          ) : (
            serviceEntries.map((svc, i) => {
              const s = svc.data
              const isLast = i === serviceEntries.length - 1
              return (
                <div key={svc.key} style={isLast ? rowLast : row}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: statusColor(s?.status ?? 'unknown'),
                      boxShadow: s?.status === 'ok'
                        ? `0 0 6px ${statusColor('ok')}60`
                        : s?.status === 'unreachable'
                          ? `0 0 6px ${statusColor('unreachable')}60`
                          : 'none',
                    }} />
                    <span style={{ fontWeight: 500 }}>{svc.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {s?.latency_ms !== undefined && (
                      <span style={{ ...val, fontSize: '11px', color: 'var(--text-muted)' }}>
                        {s.latency_ms}ms
                      </span>
                    )}
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: statusColor(s?.status ?? 'unknown'),
                    }}>
                      {statusLabel(s?.status ?? 'unknown')}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── Tailscale Peers ─────────────────────────────────────────── */}
        <div style={card}>
          <div style={sectionTitle}>
            <Wifi size={14} />
            Tailscale Peers
          </div>
          {tsLoading ? (
            <LoadingSkeleton rows={3} />
          ) : uniquePeers.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
              No peers found (tailscale may not be installed)
            </div>
          ) : (
            uniquePeers.map((peer, i) => {
              const isLast = i === uniquePeers.length - 1
              return (
                <div key={peer.hostname + peer.ip} style={isLast ? rowLast : row}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={dotStyle(peer.online)} />
                    <span style={{ fontWeight: 500 }}>{peer.hostname}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ ...val, fontSize: '11px' }}>{peer.ip}</span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 500,
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

        {/* ── SQLite Cache ────────────────────────────────────────────── */}
        <div style={card}>
          <div style={sectionTitle}>
            <Database size={14} />
            SQLite Cache
          </div>
          {healthLoading ? (
            <LoadingSkeleton rows={2} />
          ) : (
            <>
              <div style={row}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={14} style={{ color: 'var(--text-muted)' }} />
                  Cached Entries
                </span>
                <span style={val}>{health?.sqlite_cache_entries ?? '--'}</span>
              </div>
              <div style={rowLast}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HardDrive size={14} style={{ color: 'var(--text-muted)' }} />
                  Database Size
                </span>
                <span style={val}>
                  {health ? formatBytes(health.sqlite_db_size_bytes) : '--'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── App Info ────────────────────────────────────────────────── */}
        <div style={card}>
          <div style={sectionTitle}>
            <Info size={14} />
            App Info
          </div>
          {healthLoading ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <>
              <div style={row}>
                <span>Version</span>
                <span style={val}>v{health?.version ?? '--'}</span>
              </div>
              <div style={row}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                  Uptime
                </span>
                <span style={val}>
                  {health ? formatUptime(health.uptime_seconds) : '--'}
                </span>
              </div>
              <div style={row}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Monitor size={14} style={{ color: 'var(--text-muted)' }} />
                  Platform
                </span>
                <span style={val}>{health?.platform ?? '--'}</span>
              </div>
              <div style={rowLast}>
                <span>Hostname</span>
                <span style={val}>{health?.hostname ?? '--'}</span>
              </div>
            </>
          )}
        </div>

        {/* ── React Query Cache ───────────────────────────────────────── */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={sectionTitle}>
            <RefreshCw size={14} />
            React Query Cache
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
          }}>
            <StatCard label="Total Queries" value={allQueries.length} />
            <StatCard label="Stale Queries" value={staleQueries.length} accent={staleQueries.length > 0 ? 'var(--yellow)' : undefined} />
            <StatCard label="Active Fetches" value={allQueries.filter(q => q.state.fetchStatus === 'fetching').length} accent="var(--green-500)" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
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

// ── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton({ rows }: { rows: number }) {
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
