import React from 'react'
import { MessageSquare } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { SkeletonRows } from '@/components/Skeleton'
import type { Session } from './types'

interface Props {
  mounted: boolean
  sessions: Session[]
}

export const SessionsCard = React.memo(function SessionsCard({ mounted, sessions }: Props) {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <MessageSquare size={14} style={{ color: 'var(--accent-blue)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Today&apos;s Sessions</span>
      </div>
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : sessions.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No sessions found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sessions.slice(0, 10).map((s) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: 'var(--bg-base)',
              borderRadius: '6px', border: '1px solid var(--border)',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label || s.id}</div>
                {s.kind && <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.kind}</div>}
              </div>
              <div className="mono" style={{ fontSize: '10px', color: 'var(--blue-bright)', flexShrink: 0, marginLeft: '8px' }}>
                {s.lastActive ? timeAgo(s.lastActive) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
