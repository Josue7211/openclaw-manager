import { useState, useCallback, useEffect, useRef } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { api } from '@/lib/api'
import { useSupabaseRealtime } from '@/lib/hooks/useSupabaseRealtime'
import { FilterDropdown } from './FilterDropdown'
import type { Idea, IdeaStatus } from './types'
import { IDEA_LEVEL_COLORS, IDEA_STATUS_META } from './types'

export function PipelineIdeas() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [ideasFilter, setIdeasFilter] = useState<IdeaStatus | null>(null)
  const ideasFilterInitialized = useRef(false)
  const [effortFilter, setEffortFilter] = useState<string | null>(null)
  const [impactFilter, setImpactFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null)

  const fetchIdeas = useCallback(async () => {
    const json = await api.get<{ ideas?: Idea[] }>('/api/ideas')
    const list = json.ideas || []
    setIdeas(list)
    if (!ideasFilterInitialized.current && list.length > 0) {
      ideasFilterInitialized.current = true
      if (list.some(i => i.status === 'pending')) {
        setIdeasFilter('pending')
      }
    }
  }, [])

  useEffect(() => { fetchIdeas() }, [fetchIdeas])
  useSupabaseRealtime('pipeline-ideas-rt', 'ideas', { onEvent: fetchIdeas })

  const updateIdeaStatus = async (id: string, newStatus: IdeaStatus) => {
    setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, status: newStatus } : idea))
    try {
      const json = await api.patch<{ idea?: Idea }>('/api/ideas', { id, status: newStatus })
      if (json.idea) setIdeas(prev => prev.map(idea => idea.id === id ? json.idea! : idea))
    } catch {
      fetchIdeas()
    }
  }

  const bulkUpdateStatus = async (newStatus: IdeaStatus) => {
    if (selectedIds.size === 0) return
    setBulkActing(true)
    const ids = [...selectedIds]
    setIdeas(prev => prev.map(i => ids.includes(i.id) ? { ...i, status: newStatus } : i))
    try {
      await Promise.all(ids.map(id =>
        api.patch('/api/ideas', { id, status: newStatus })
      ))
    } catch { /* silent */ }
    setSelectedIds(new Set())
    setBulkActing(false)
    fetchIdeas()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const categories = [...new Set(ideas.map(i => i.category).filter(Boolean))].sort()
  const hasActiveFilters = ideasFilter !== null || effortFilter !== null || impactFilter !== null || categoryFilter !== null
  const filtered = ideas.filter(i => {
    if (ideasFilter && i.status !== ideasFilter) return false
    if (effortFilter && i.effort !== effortFilter) return false
    if (impactFilter && i.impact !== impactFilter) return false
    if (categoryFilter && i.category !== categoryFilter) return false
    return true
  })

  const allSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Status pills row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setIdeasFilter(null)}
          style={{
            padding: '5px 12px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: ideasFilter === null ? 'rgba(255,255,255,0.2)' : 'transparent',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            background: ideasFilter === null ? 'var(--hover-bg-bright)' : 'transparent',
            color: ideasFilter === null ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'all 0.15s var(--ease-spring)',
          }}
        >
          All <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: '2px' }}>{ideas.length}</span>
        </button>
        {IDEA_STATUS_META.map(({ status, label, color }) => {
          const active = ideasFilter === status
          const count = ideas.filter(i => i.status === status).length
          return (
            <button
              key={status}
              onClick={() => setIdeasFilter(active ? null : status)}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: active ? `${color}66` : 'transparent',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                background: active ? `${color}18` : 'transparent',
                color: active ? color : 'var(--text-muted)',
                transition: 'all 0.15s var(--ease-spring)',
              }}
            >
              {label} <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: '2px' }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Secondary filters row: effort, impact, category + select all */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <FilterDropdown
          label="Effort"
          value={effortFilter}
          options={['low', 'medium', 'high']}
          onChange={setEffortFilter}
          colorMap={IDEA_LEVEL_COLORS}
        />
        <FilterDropdown
          label="Impact"
          value={impactFilter}
          options={['low', 'medium', 'high']}
          onChange={setImpactFilter}
          colorMap={IDEA_LEVEL_COLORS}
        />
        <FilterDropdown
          label="Category"
          value={categoryFilter}
          options={categories}
          onChange={setCategoryFilter}
        />

        {hasActiveFilters && (
          <button
            onClick={() => { setIdeasFilter(null); setEffortFilter(null); setImpactFilter(null); setCategoryFilter(null) }}
            style={{
              padding: '4px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '11px', fontWeight: 500, background: 'var(--red-a08)', color: 'var(--red)',
              transition: 'all 0.12s',
            }}
          >
            Clear filters
          </button>
        )}

        <span style={{ flex: 1 }} />

        {/* Result count */}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>

        {/* Select all */}
        {filtered.length > 0 && (
          <button
            onClick={() => {
              if (allSelected) setSelectedIds(new Set())
              else setSelectedIds(new Set(filtered.map(i => i.id)))
            }}
            style={{
              padding: '5px 12px',
              borderRadius: '8px',
              border: '1px solid',
              borderColor: allSelected ? 'var(--purple-a30)' : 'transparent',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              background: allSelected ? 'var(--purple-a10)' : 'transparent',
              color: allSelected ? 'var(--accent-bright)' : 'var(--text-muted)',
              transition: 'all 0.15s var(--ease-spring)',
            }}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      {/* Idea cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {(() => {
          if (filtered.length === 0) {
            return (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                {hasActiveFilters ? 'No ideas match filters' : 'No ideas yet'}
              </div>
            )
          }
          return filtered.map((idea, idx) => {
            const statusMeta = IDEA_STATUS_META.find(s => s.status === idea.status)
            const isSelected = selectedIds.has(idea.id)
            const isExpanded = expandedIdeaId === idea.id
            return (
              <div
                key={idea.id}
                style={{
                  borderRadius: idx === 0 ? '10px 10px 2px 2px' : idx === filtered.length - 1 ? '2px 2px 10px 10px' : '2px',
                  background: isExpanded ? 'var(--bg-white-04)' : isSelected ? 'var(--purple-a08)' : 'var(--bg-white-02)',
                  border: '1px solid',
                  borderColor: isExpanded ? 'var(--purple-a30)' : isSelected ? 'var(--purple-a20)' : 'var(--border)',
                  transition: 'all 0.15s var(--ease-spring)',
                  marginBottom: '-1px',
                  position: 'relative',
                  zIndex: isExpanded ? 2 : isSelected ? 1 : 0,
                  overflow: 'hidden',
                }}
              >
                {/* Row header */}
                <div
                  onClick={() => setExpandedIdeaId(isExpanded ? null : idea.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    cursor: 'pointer',
                  }}
                >
                  {/* Circular select checkbox */}
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleSelect(idea.id) }}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--bg-white-15)'}`,
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      cursor: 'pointer',
                      transition: 'all 0.15s var(--ease-spring)',
                    }}
                  >
                    {isSelected && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>

                  {/* Title + inline badges */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4,
                      }}>
                        {idea.title}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {statusMeta && (
                        <span style={{
                          padding: '1px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                          background: `${statusMeta.color}15`, color: statusMeta.color,
                        }}>{statusMeta.label}</span>
                      )}
                      {idea.category && (
                        <span style={{
                          padding: '1px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 500,
                          background: 'var(--purple-a10)', color: 'var(--accent)',
                        }}>
                          {idea.category}
                        </span>
                      )}
                      {idea.effort && (
                        <span style={{ fontSize: '10px', color: IDEA_LEVEL_COLORS[idea.effort], fontWeight: 500 }}>
                          {idea.effort} effort
                        </span>
                      )}
                      {idea.impact && (
                        <span style={{ fontSize: '10px', color: IDEA_LEVEL_COLORS[idea.impact], fontWeight: 500 }}>
                          {idea.impact} impact
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Inline actions */}
                  <div role="presentation" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                    {(idea.status === 'pending' || idea.status === 'deferred') && (
                      <>
                        <button onClick={() => updateIdeaStatus(idea.id, 'approved')} title="Approve" style={{
                          padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          fontSize: '11px', fontWeight: 600, background: 'var(--green-a12)', color: 'var(--green)',
                          transition: 'all 0.12s',
                        }}>Approve</button>
                        <button onClick={() => updateIdeaStatus(idea.id, 'rejected')} title="Reject" style={{
                          padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          fontSize: '11px', fontWeight: 600, background: 'var(--red-a12)', color: 'var(--red)',
                          transition: 'all 0.12s',
                        }}>Reject</button>
                        {idea.status === 'pending' && (
                          <button onClick={() => updateIdeaStatus(idea.id, 'deferred')} title="Defer" style={{
                            padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            fontSize: '11px', fontWeight: 600, background: 'var(--gold-a12)', color: 'var(--gold)',
                            transition: 'all 0.12s',
                          }}>Defer</button>
                        )}
                      </>
                    )}
                    {idea.status === 'approved' && idea.mission_id && (
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--green)', opacity: 0.8 }}>Queued</span>
                    )}
                    {idea.status === 'approved' && !idea.mission_id && (
                      <button onClick={() => updateIdeaStatus(idea.id, 'built')} style={{
                        padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        fontSize: '11px', fontWeight: 600, background: 'var(--purple-a12)', color: 'var(--accent-bright)',
                        transition: 'all 0.12s',
                      }}>Built</button>
                    )}
                  </div>

                  {/* Chevron */}
                  <div style={{
                    flexShrink: 0, color: 'var(--text-muted)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'flex', alignItems: 'center',
                  }}>
                    <ChevronDown size={14} />
                  </div>
                </div>

                {/* Expandable detail body */}
                <div style={{
                  display: 'grid',
                  gridTemplateRows: isExpanded ? '1fr' : '0fr',
                  transition: 'grid-template-rows 0.25s var(--ease-spring)',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0 14px 14px', paddingLeft: '46px' }}>
                      {idea.description && (
                        <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {idea.description}
                        </p>
                      )}
                      {idea.why && (
                        <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                          {idea.why}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {idea.effort && (
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                            background: `${IDEA_LEVEL_COLORS[idea.effort]}18`, color: IDEA_LEVEL_COLORS[idea.effort],
                          }}>Effort: {idea.effort}</span>
                        )}
                        {idea.impact && (
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                            background: `${IDEA_LEVEL_COLORS[idea.impact]}18`, color: IDEA_LEVEL_COLORS[idea.impact],
                          }}>Impact: {idea.impact}</span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(idea.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        })()}
      </div>

      {/* Discord-style floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          borderRadius: '12px',
          background: 'var(--bg-modal)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border-accent)',
          boxShadow: '0 8px 32px var(--overlay), 0 0 0 1px var(--bg-white-04)',
          zIndex: 1000,
          animation: 'fadeInUp 0.2s var(--ease-spring) both',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-bright)' }}>
            {selectedIds.size} selected
          </span>
          <div style={{ width: '1px', height: '20px', background: 'var(--hover-bg-bright)' }} />
          <button onClick={() => bulkUpdateStatus('approved')} disabled={bulkActing} style={{
            padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: bulkActing ? 'wait' : 'pointer',
            fontSize: '12px', fontWeight: 600, background: 'var(--green-a15)', color: 'var(--green)',
            opacity: bulkActing ? 0.5 : 1, transition: 'all 0.12s',
          }}>Approve</button>
          <button onClick={() => bulkUpdateStatus('rejected')} disabled={bulkActing} style={{
            padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: bulkActing ? 'wait' : 'pointer',
            fontSize: '12px', fontWeight: 600, background: 'var(--red-a15)', color: 'var(--red)',
            opacity: bulkActing ? 0.5 : 1, transition: 'all 0.12s',
          }}>Reject</button>
          <button onClick={() => bulkUpdateStatus('deferred')} disabled={bulkActing} style={{
            padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: bulkActing ? 'wait' : 'pointer',
            fontSize: '12px', fontWeight: 600, background: 'var(--gold-a25)', color: 'var(--gold)',
            opacity: bulkActing ? 0.5 : 1, transition: 'all 0.12s',
          }}>Defer</button>
          <div style={{ width: '1px', height: '20px', background: 'var(--hover-bg-bright)' }} />
          <button onClick={() => setSelectedIds(new Set())} style={{
            padding: '6px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 500, background: 'transparent', color: 'var(--text-muted)',
            transition: 'all 0.12s',
          }}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
