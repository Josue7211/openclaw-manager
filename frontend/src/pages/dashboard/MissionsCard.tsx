import React from 'react'
import { Target, Rocket } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/Skeleton'
import { missionStatusStyle } from './types'
import { useMissions } from '@/lib/hooks/dashboard'

export const MissionsCard = React.memo(function MissionsCard() {
  const { missions, updateMissionStatus, deleteMission } = useMissions()
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Target size={14} style={{ color: 'var(--red-bright)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Missions</span>
      </div>
      {missions === undefined ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ position: 'relative' }}>
        <div className="hidden-scrollbar" style={{ maxHeight: '320px', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {missions.length === 0 ? (
            <div style={{ padding: '8px 0' }}><EmptyState icon={Rocket} title="No missions" description="Active missions will appear here." /></div>
          ) : missions.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
              background: 'var(--bg-white-03)', borderRadius: '10px', border: '1px solid var(--border)', transition: 'all 0.2s var(--ease-spring)',
            }}>
              <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-primary)' }}>{m.title}</span>
              <span style={{
                fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                textTransform: 'capitalize', fontFamily: 'monospace',
              }}>{m.assignee}</span>
              <button
                onClick={() => updateMissionStatus(m.id, m.status)}
                style={{
                  fontSize: '10px', padding: '3px 10px', borderRadius: '8px', border: 'none',
                  cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize',
                  transition: 'all 0.2s var(--ease-spring)',
                  ...missionStatusStyle(m.status),
                }}
              >{m.status}</button>
              <button onClick={() => deleteMission(m.id)} className="btn-delete" aria-label="Delete mission">✕</button>
            </div>
          ))}
        </div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28px', background: 'linear-gradient(to bottom, transparent, var(--bg-card-solid))', pointerEvents: 'none' }} />
        </div>
      )}
    </div>
  )
})
