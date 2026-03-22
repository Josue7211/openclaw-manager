import React from 'react'
import { Pulse } from '@phosphor-icons/react'
import { timeAgo } from '@/lib/utils'
import { Skeleton } from '@/components/Skeleton'
import { useAgentStatus } from '@/lib/hooks/dashboard'

export const AgentStatusCard = React.memo(function AgentStatusCard() {
  const { mounted, status } = useAgentStatus()
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Pulse size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agent Status</span>
      </div>
      {!mounted ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <Skeleton width={48} height={48} radius={8} style={{ marginBottom: 0 }} />
            <div style={{ flex: 1 }}>
              <Skeleton width="50%" height="20px" style={{ marginBottom: '10px' }} />
              <div style={{ display: 'flex', gap: '20px' }}>
                <Skeleton width="60px" height="12px" style={{ marginBottom: 0 }} />
                <Skeleton width="80px" height="12px" style={{ marginBottom: 0 }} />
                <Skeleton width="70px" height="12px" style={{ marginBottom: 0 }} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontSize: '48px' }}>{status?.emoji || '🦬'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700 }}>{status?.name || 'Bjorn'}</span>
              {/* Green dot = online signal */}
              <span className="badge badge-green" aria-live="polite">
                <span style={{
                  display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
                  background: 'var(--secondary)', marginRight: '5px',
                  animation: 'pulse-dot 2s infinite',
                }} />
                Online
              </span>
            </div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {[
                { label: 'Model', val: status?.model, color: 'var(--tertiary)' },
                { label: 'Host',  val: status?.host,  color: 'var(--text-primary)' },
                { label: 'IP',    val: status?.ip,    color: 'var(--text-primary)' },
                { label: 'Last Active', val: timeAgo(status?.lastActive || null), color: 'var(--text-primary)' },
              ].map(({ label, val, color }) => (
                <div key={label}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>{label}</div>
                  <div className="mono" style={{ color }}>{val || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
