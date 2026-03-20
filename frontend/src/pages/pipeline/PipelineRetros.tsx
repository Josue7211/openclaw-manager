import { useState, useEffect } from 'react'
import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Retrospective } from './types'
import { formatDate } from './utils'

export function PipelineRetros() {
  const [retros, setRetros] = useState<Retrospective[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchRetros()
  }, [])

  async function fetchRetros() {
    setLoading(true)
    const json = await api.get<{ retrospectives?: Retrospective[] }>('/api/retrospectives')
    setRetros(json.retrospectives || [])
    setLoading(false)
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {retros.length === 0 ? (
        <EmptyState icon={ArrowCounterClockwise} title="No retrospectives yet" description="Retrospectives will appear after completed sprints." />
      ) : (
        retros.map((r) => (
          <div
            key={r.id}
            style={{
              background: 'var(--bg-white-03)',
              border: '1px solid var(--hover-bg-bright)',
              borderRadius: '10px',
              padding: '16px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                {r.week || formatDate(r.created_at)}
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{'\u2705'} {r.missions_completed ?? 0} missions</span>
                <span>{'\ud83d\udca1'} {r.ideas_generated ?? 0} ideas</span>
                <span>{'\u2713'} {r.ideas_approved ?? 0} approved</span>
              </div>
            </div>
            {r.wins?.length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--secondary)', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wins</div>
                {r.wins.map((w, i) => (
                  <div key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '8px' }}>{'\u2022'} {w}</div>
                ))}
              </div>
            )}
            {r.failures?.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--red)', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Failures</div>
                {r.failures.map((f, i) => (
                  <div key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '8px' }}>{'\u2022'} {f}</div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
