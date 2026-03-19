import React from 'react'
import { Brain } from '@phosphor-icons/react'
import { SkeletonRows } from '@/components/Skeleton'
import type { MemoryEntry } from './types'

interface Props {
  mounted: boolean
  memory: MemoryEntry[]
}

export const MemoryCard = React.memo(function MemoryCard({ mounted, memory }: Props) {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Brain size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Memory</span>
      </div>
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : memory.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No memory files yet</div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
            {memory.map((entry) => (
              <div key={entry.date} style={{ padding: '10px 12px', background: 'var(--bg-white-03)', borderRadius: '10px', border: '1px solid var(--border)', transition: 'all 0.2s var(--ease-spring)' }}>
                <div className="mono" style={{ color: 'var(--accent-bright)', fontSize: '11px', marginBottom: '3px' }}>{entry.date}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {entry.preview || <em style={{ color: 'var(--text-muted)' }}>empty</em>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28px', background: 'linear-gradient(to bottom, transparent, var(--bg-card-solid))', pointerEvents: 'none' }} />
        </div>
      )}
    </div>
  )
})
