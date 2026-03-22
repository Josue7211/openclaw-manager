import React from 'react'
import { WifiHigh, ArrowRight, ArrowDown, ArrowUp } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useHomelabWidget } from '@/lib/hooks/dashboard/useHomelabWidget'
import type { WidgetProps } from '@/lib/widget-registry'

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h`
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

function UsageBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '28px', flexShrink: 0 }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: '6px', borderRadius: '3px',
        background: 'var(--bg-elevated)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(percent, 100)}%`, height: '100%', borderRadius: '3px',
          background: percent > 80 ? 'var(--red-500)' : percent > 50 ? 'var(--orange)' : 'var(--accent)',
          transition: 'width 0.3s var(--ease-spring)',
        }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', width: '28px', textAlign: 'right', flexShrink: 0 }}>
        {percent}%
      </span>
    </div>
  )
}

export const NetworkStatusWidget = React.memo(function NetworkStatusWidget(_props: WidgetProps) {
  const { opnsense, mounted } = useHomelabWidget()
  const navigate = useNavigate()

  const isOnline = opnsense?.status === 'online'
  const cpuPercent = opnsense?.cpu ?? 0
  const memPercent = opnsense ? Math.round((opnsense.mem_used / opnsense.mem_total) * 100) : 0

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <WifiHigh size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Network
        </span>
        {mounted && opnsense && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: isOnline ? 'var(--green-500)' : 'var(--red-500)',
            color: 'var(--text-on-accent)',
            fontWeight: 600, lineHeight: 1,
          }}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : !opnsense ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
          OPNsense not connected
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
          {/* WAN traffic */}
          <div style={{
            padding: '8px 10px', borderRadius: '8px',
            background: 'var(--bg-white-03)', border: '1px solid var(--border)',
          }}>
            <div style={{
              fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
              letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '6px',
            }}>
              WAN Traffic
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowDown size={10} style={{ color: 'var(--green-500)' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {opnsense.wan_in}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowUp size={10} style={{ color: 'var(--blue)' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {opnsense.wan_out}
                </span>
              </div>
            </div>
          </div>

          {/* CPU + Memory bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <UsageBar label="CPU" percent={cpuPercent} />
            <UsageBar label="RAM" percent={memPercent} />
          </div>

          {/* Uptime */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Uptime:</span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {formatUptime(opnsense.uptime)}
            </span>
          </div>

          {/* View all link */}
          <button
            onClick={() => navigate('/homelab')}
            aria-label="View all network details"
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
