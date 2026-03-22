import React from 'react'
import { Heartbeat, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useSystemInfo } from '@/lib/hooks/dashboard/useSystemInfo'
import type { SystemService } from '@/lib/hooks/dashboard/useSystemInfo'
import type { WidgetProps } from '@/lib/widget-registry'

function statusColor(status: string): string {
  switch (status) {
    case 'ok': return 'var(--green-500)'
    case 'not_configured': return 'var(--text-muted)'
    case 'error': case 'degraded': case 'unreachable': return 'var(--red-500)'
    default: return 'var(--text-muted)'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ok': return 'Connected'
    case 'not_configured': return 'Not configured'
    case 'error': return 'Error'
    case 'unreachable': return 'Unreachable'
    case 'degraded': return 'Degraded'
    default: return status
  }
}

export const SystemInfoWidget = React.memo(function SystemInfoWidget(_props: WidgetProps) {
  const { services, allHealthy, connectedCount, totalCount, mounted } = useSystemInfo()
  const navigate = useNavigate()

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Heartbeat size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          System
        </span>
        {mounted && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            color: allHealthy ? 'var(--green-500)' : 'var(--red-500)',
            fontWeight: 600,
          }}>
            <span
              aria-hidden="true"
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: allHealthy ? 'var(--green-500)' : 'var(--red-500)',
              }}
            />
            {connectedCount}/{totalCount}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0 }}>
          {services.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No services configured
            </div>
          ) : (
            services.map((svc: SystemService) => (
              <div
                key={svc.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '8px', transition: 'background 0.15s',
                }}
                className="hover-bg"
              >
                {/* Status dot */}
                <span
                  aria-hidden="true"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: statusColor(svc.status),
                    flexShrink: 0,
                  }}
                />
                {/* Service name */}
                <span style={{
                  fontSize: '12px', color: 'var(--text-primary)', flex: 1,
                }}>
                  {svc.name}
                </span>
                {/* Status / latency */}
                <span style={{
                  fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace',
                  flexShrink: 0,
                }}>
                  {svc.status === 'ok' && svc.latency_ms != null
                    ? `${svc.latency_ms}ms`
                    : statusLabel(svc.status)
                  }
                </span>
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/settings', { state: { section: 'connections' } })}
            aria-label="View all connections in settings"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto',
              paddingTop: '8px', fontSize: '11px', color: 'var(--accent)',
              background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            }}
          >
            View all <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
})
