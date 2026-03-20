import { memo, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Pulse } from '@phosphor-icons/react'

type ServiceStatus = 'connected' | 'degraded' | 'unreachable'

interface ServiceHealth {
  name: string
  shortName: string
  status: ServiceStatus
  latencyMs: number | null
}

const STATUS_COLORS: Record<ServiceStatus, string> = {
  connected: 'var(--secondary-dim)',
  degraded: 'var(--yellow)',
  unreachable: 'var(--red-500)',
}

const STATUS_LABELS: Record<ServiceStatus, string> = {
  connected: 'Connected',
  degraded: 'Slow',
  unreachable: 'Unreachable',
}

/** Threshold in ms — anything above this is "degraded" */
const SLOW_THRESHOLD = 5000

async function checkService(
  name: string,
  shortName: string,
  path: string,
): Promise<ServiceHealth> {
  const start = performance.now()
  try {
    await api.get(path)
    const latencyMs = Math.round(performance.now() - start)
    return {
      name,
      shortName,
      status: latencyMs > SLOW_THRESHOLD ? 'degraded' : 'connected',
      latencyMs,
    }
  } catch {
    return { name, shortName, status: 'unreachable', latencyMs: null }
  }
}

async function checkAllServices(): Promise<ServiceHealth[]> {
  const [bb, oc, sb] = await Promise.all([
    checkService('BlueBubbles', 'BB', '/api/messages?limit=0'),
    checkService('OpenClaw', 'OC', '/api/status'),
    checkService('Supabase', 'SB', '/api/todos'),
  ])
  return [bb, oc, sb]
}

function StatusDot({ status, size = 8 }: { status: ServiceStatus; size?: number }) {
  const color = STATUS_COLORS[status]
  return (
    <span
      style={{
        display: 'inline-block',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: color,
        boxShadow: status === 'connected'
          ? `0 0 6px ${color}60`
          : status === 'unreachable'
            ? `0 0 6px ${color}80`
            : 'none',
        flexShrink: 0,
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
      }}
    />
  )
}

export const ConnectionStatus = memo(function ConnectionStatus({
  collapsed,
  textOpacity,
}: {
  collapsed: boolean
  textOpacity: number
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: services } = useQuery({
    queryKey: ['connection-health'],
    queryFn: checkAllServices,
    refetchInterval: 30_000,
    staleTime: 25_000,
    refetchOnWindowFocus: false,
  })

  const toggle = useCallback(() => setExpanded(o => !o), [])

  // Default to 3 unknown dots while loading
  const items: ServiceHealth[] = services ?? [
    { name: 'BlueBubbles', shortName: 'BB', status: 'degraded' as ServiceStatus, latencyMs: null },
    { name: 'OpenClaw', shortName: 'OC', status: 'degraded' as ServiceStatus, latencyMs: null },
    { name: 'Supabase', shortName: 'SB', status: 'degraded' as ServiceStatus, latencyMs: null },
  ]

  const allConnected = items.every(s => s.status === 'connected')
  const anyUnreachable = items.some(s => s.status === 'unreachable')

  return (
    <div data-tour="connection-status" style={{ padding: '0 8px', marginBottom: '2px' }} aria-live="polite">
      <button
        onClick={toggle}
        title={collapsed ? `Services: ${items.map(s => `${s.shortName} ${STATUS_LABELS[s.status]}`).join(', ')}` : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px 16px',
          background: 'transparent',
          border: 'none',
          borderLeft: '2px solid transparent',
          borderRadius: '10px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 450,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          transition: 'background 0.15s ease, color 0.15s ease',
          justifyContent: 'flex-start',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--hover-bg)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-secondary)'
        }}
      >
        <Pulse
          size={20}
          style={{
            flexShrink: 0,
            minWidth: '20px',
            color: anyUnreachable ? 'var(--red-500)' : allConnected ? 'var(--secondary-dim)' : 'var(--yellow)',
            transition: 'color 0.3s ease',
          }}
        />
        {collapsed ? (
          /* Collapsed: show 3 dots stacked vertically inside the icon area */
          <span style={{
            display: 'flex',
            gap: '3px',
            position: 'absolute',
            right: '12px',
          }}>
            {items.map(s => (
              <StatusDot key={s.shortName} status={s.status} size={6} />
            ))}
          </span>
        ) : (
          <span style={{ opacity: textOpacity, overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Services
            <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {items.map(s => (
                <StatusDot key={s.shortName} status={s.status} size={6} />
              ))}
            </span>
          </span>
        )}
      </button>

      {/* Expanded detail panel */}
      {expanded && !collapsed && (
        <div style={{
          margin: '2px 4px 4px',
          padding: '8px 12px',
          background: 'var(--bg-white-03)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          animation: 'fadeIn 0.15s ease',
        }}>
          {items.map(s => (
            <div
              key={s.shortName}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 4px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusDot status={s.status} size={8} />
                <span style={{ fontWeight: 500 }}>{s.name}</span>
              </span>
              <span style={{
                fontSize: '11px',
                color: STATUS_COLORS[s.status],
                fontWeight: 500,
              }}>
                {s.latencyMs !== null
                  ? `${STATUS_LABELS[s.status]} (${s.latencyMs}ms)`
                  : services ? STATUS_LABELS[s.status] : 'Checking...'
                }
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
