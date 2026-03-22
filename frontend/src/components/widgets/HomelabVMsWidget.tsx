import React from 'react'
import { Cpu, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useHomelabWidget } from '@/lib/hooks/dashboard/useHomelabWidget'
import type { WidgetProps } from '@/lib/widget-registry'

export const HomelabVMsWidget = React.memo(function HomelabVMsWidget({ size, config }: WidgetProps) {
  const { vms, runningCount, totalCount, mounted } = useHomelabWidget()
  const navigate = useNavigate()

  const maxVMs = Number(config.maxVMs ?? 5)
  const showStopped = config.showStopped !== undefined ? Boolean(config.showStopped) : true

  const compact = size.h <= 2
  const filteredVMs = showStopped ? vms : vms.filter(vm => vm.status === 'running')
  const limit = compact ? Math.min(maxVMs, 3) : maxVMs
  const displayVMs = filteredVMs.slice(0, limit)

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Cpu size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          VMs
        </span>
        {mounted && totalCount > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: runningCount === totalCount ? 'var(--green-500)' : 'var(--accent)',
            color: 'var(--text-on-accent)',
            fontWeight: 600, lineHeight: 1,
          }}>
            {runningCount}/{totalCount} running
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0, overflowY: 'auto' }}>
          {displayVMs.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No VMs found
            </div>
          ) : (
            displayVMs.map(vm => (
              <div
                key={vm.vmid}
                className="hover-bg"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '8px', transition: 'background 0.15s',
                }}
              >
                {/* Status dot */}
                <span
                  aria-label={vm.status === 'running' ? 'Running' : 'Stopped'}
                  style={{
                    width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                    background: vm.status === 'running' ? 'var(--green-500)' : 'var(--red-500)',
                  }}
                />
                {/* VM name */}
                <span style={{
                  fontSize: '12px', color: 'var(--text-primary)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontWeight: 500,
                }}>
                  {vm.name}
                </span>
                {/* CPU % */}
                {vm.status === 'running' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', width: '28px', textAlign: 'right' }}>
                      {vm.cpuPercent}%
                    </span>
                    <div style={{
                      width: '32px', height: '4px', borderRadius: '2px',
                      background: 'var(--bg-elevated)', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.min(vm.cpuPercent, 100)}%`, height: '100%', borderRadius: '2px',
                        background: vm.cpuPercent > 80 ? 'var(--red-500)' : vm.cpuPercent > 50 ? 'var(--orange)' : 'var(--accent)',
                        transition: 'width 0.3s var(--ease-spring)',
                      }} />
                    </div>
                  </div>
                )}
                {/* RAM */}
                {vm.status === 'running' && (
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace',
                    flexShrink: 0, width: '52px', textAlign: 'right',
                  }}>
                    {vm.memUsedGB.toFixed(1)}/{vm.memTotalGB}G
                  </span>
                )}
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/homelab')}
            aria-label="View all homelab resources"
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
