import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { WorkflowNote } from './types'
import { CATEGORIES, CATEGORY_COLORS } from './types'
import { formatDate } from './utils'

export function PipelineNotes() {
  const [notes, setNotes] = useState<WorkflowNote[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchNotes()
  }, [])

  async function fetchNotes() {
    setLoading(true)
    const json = await api.get<{ notes?: WorkflowNote[] }>('/api/workflow-notes')
    setNotes(json.notes || [])
    setLoading(false)
  }

  async function markApplied(id: string, current: boolean) {
    const json = await api.patch<{ note?: WorkflowNote }>('/api/workflow-notes', { id, applied: !current })
    if (json.note) {
      setNotes((prev) => prev.map((n) => (n.id === id ? json.note! : n)))
    }
  }

  const grouped = CATEGORIES.reduce<Record<string, WorkflowNote[]>>((acc, cat) => {
    acc[cat] = notes.filter((n) => n.category === cat)
    return acc
  }, {})

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {CATEGORIES.map((cat) => (
        <div key={cat}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
          }}>
            <span style={{
              padding: '2px 8px',
              borderRadius: '4px',
              background: CATEGORY_COLORS[cat] + '22',
              border: `1px solid ${CATEGORY_COLORS[cat]}44`,
              color: CATEGORY_COLORS[cat],
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {cat}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {grouped[cat].length} note{grouped[cat].length !== 1 ? 's' : ''}
            </span>
          </div>
          {grouped[cat].length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingLeft: '8px' }}>No notes yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {grouped[cat].map((n) => (
                <div
                  key={n.id}
                  style={{
                    background: 'var(--bg-white-02)',
                    border: '1px solid var(--active-bg)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    opacity: n.applied ? 0.5 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {n.note}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {formatDate(n.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => markApplied(n.id, n.applied)}
                    style={{
                      flexShrink: 0,
                      padding: '4px 10px',
                      background: n.applied ? 'var(--emerald-a15)' : 'transparent',
                      border: n.applied ? '1px solid var(--emerald-a15)' : '1px solid var(--border-hover)',
                      borderRadius: '6px',
                      color: n.applied ? 'var(--green)' : 'var(--text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {n.applied ? '\u2713 Applied' : 'Mark applied'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {notes.filter((n) => !CATEGORIES.includes(n.category)).length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Other</div>
          {notes.filter((n) => !CATEGORIES.includes(n.category)).map((n) => (
            <div key={n.id} style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '8px', borderBottom: '1px solid var(--bg-white-04)' }}>
              [{n.category}] {n.note}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
