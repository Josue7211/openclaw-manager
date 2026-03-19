import React from 'react'
import { Cpu } from '@phosphor-icons/react'
import { timeAgo, formatTime } from '@/lib/utils'
import { Skeleton } from '@/components/Skeleton'
import type { HeartbeatData } from './types'

interface Props {
  mounted: boolean
  heartbeat: HeartbeatData | null
}

export const HeartbeatCard = React.memo(function HeartbeatCard({ mounted, heartbeat }: Props) {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Cpu size={14} style={{ color: 'var(--accent-blue)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Heartbeat</span>
      </div>
      {!mounted ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <Skeleton width="60px" height="20px" style={{ marginBottom: 0 }} />
            <Skeleton width="50px" height="14px" style={{ marginBottom: 0 }} />
          </div>
          <Skeleton width="100%" height="14px" />
          <Skeleton width="80%" height="14px" />
          <Skeleton width="90%" height="14px" style={{ marginBottom: 0 }} />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span className={`badge ${
              heartbeat?.status === 'ok' ? 'badge-green'
              : heartbeat?.status ? 'badge-red'
              : 'badge-gray'
            }`}>
              {heartbeat?.status === 'ok' ? '✓ OK' : heartbeat?.status || 'Unknown'}
            </span>
            <span className="mono" style={{ color: 'var(--text-muted)' }}>{formatTime(heartbeat?.lastCheck || null)}</span>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              {heartbeat?.tasks && heartbeat.tasks.length > 0 ? (
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tasks</div>
                  {heartbeat.tasks.map((t, i) => (
                    <div key={i} className="mono" style={{ color: 'var(--text-secondary)', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>— {t}</div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active tasks</div>
              )}
              <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                Last check: {timeAgo(heartbeat?.lastCheck || null)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
})
