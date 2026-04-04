import React from 'react'
import { Brain } from '@phosphor-icons/react'
import { SkeletonRows } from '@/components/Skeleton'
import { useMemoryEntries } from '@/lib/hooks/dashboard'

export const MemoryCard = React.memo(function MemoryCard() {
  const { memory, loading } = useMemoryEntries()
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Brain size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Memory</span>
      </div>
      {loading ? (
        <SkeletonRows count={3} />
      ) : memory.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No memory entries yet</div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
            {memory.map((entry) => (
              <div key={entry.path} style={{ padding: '10px 12px', background: 'var(--bg-white-03)', borderRadius: '10px', border: '1px solid var(--border)', transition: 'all 0.2s var(--ease-spring)' }}>
                <div className="mono" style={{ color: 'var(--accent-bright)', fontSize: '11px', marginBottom: '3px' }}>
                  {entry.date.includes('T') ? entry.date.slice(0, 10) : entry.date}
                </div>
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
