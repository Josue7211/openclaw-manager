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

import type { HealthData, TailscaleData } from './status/types'
import { formatUptime, formatBytes, statusColor, statusLabel } from './status/helpers'
import { card, sectionTitle, row, rowLast, val, dotStyle } from './status/styles'
import { StatCard } from './status/StatCard'
import { LoadingSkeleton } from './status/LoadingSkeleton'

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
  const serviceEntries: { key: string; label: string; data: import('./status/types').ServiceStatus | undefined }[] = [
    { key: 'bluebubbles', label: 'BlueBubbles', data: services?.bluebubbles },
    { key: 'openclaw', label: 'OpenClaw', data: services?.openclaw },
    { key: 'supabase', label: 'Supabase', data: services?.supabase },
  ]

  // Deduplicate Tailscale peers by hostname (multiple IPs per peer)
  const peers = tailscale?.peers ?? []
  const uniquePeers = peers.reduce<import('./status/types').TailscalePeer[]>((acc, p) => {
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
