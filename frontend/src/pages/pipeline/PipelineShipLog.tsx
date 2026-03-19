import React, { useState, useCallback, useEffect } from 'react'
import { Plus, X, Tag, Trash, Calendar, Rocket } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import type { Idea, ChangelogEntry, IdeaStatus } from './types'
import { IDEA_STATUS_META } from './types'
import { formatDay, groupByMonth } from './utils'
import { MarkdownText } from './MarkdownText'
import { useTableRealtime } from '@/lib/hooks/useRealtimeSSE'

export function PipelineShipLog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [shipLoading, setShipLoading] = useState(true)
  const [showShipForm, setShowShipForm] = useState(false)
  const [shipSubmitting, setShipSubmitting] = useState(false)
  const [shipForm, setShipForm] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    tags: '',
  })

  // Ideas for the stats cards at the bottom
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [ideasFilter, setIdeasFilter] = useState<IdeaStatus | null>(null)

  const fetchShipLog = useCallback(() => {
    setShipLoading(true)
    api.get<{ entries?: ChangelogEntry[] }>('/api/changelog')
      .then(d => setEntries(d.entries || []))
      .catch(() => {})
      .finally(() => setShipLoading(false))
  }, [])

  const fetchIdeas = useCallback(async () => {
    const json = await api.get<{ ideas?: Idea[] }>('/api/ideas')
    setIdeas(json.ideas || [])
  }, [])

  useEffect(() => {
    fetchShipLog()
    fetchIdeas()
  }, [fetchShipLog, fetchIdeas])

  // Real-time subscription via SSE
  useTableRealtime('ideas', { onEvent: fetchIdeas })

  const handleShipSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shipForm.title.trim()) return
    setShipSubmitting(true)
    try {
      const tags = shipForm.tags.split(',').map(t => t.trim()).filter(Boolean)
      const json = await api.post<{ entry?: ChangelogEntry }>('/api/changelog', { ...shipForm, tags })
      if (json.entry) {
        setEntries(prev => [json.entry!, ...prev])
        setShipForm({ title: '', date: new Date().toISOString().slice(0, 10), description: '', tags: '' })
        setShowShipForm(false)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setShipSubmitting(false)
    }
  }

  const deleteShipEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    await api.del('/api/changelog', { id })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const shipGroups = groupByMonth(entries)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Rocket size={16} style={{ color: 'var(--accent-bright)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Ship Log</span>
          {!shipLoading && (
            <span style={{
              padding: '1px 7px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'var(--purple-a12)',
              color: 'var(--accent)',
              border: '1px solid var(--purple-a20)',
            }}>
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowShipForm(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid var(--purple-a30)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            background: showShipForm ? 'var(--purple-a15)' : 'transparent',
            color: 'var(--accent-bright)',
            transition: 'all 0.15s',
          }}
        >
          {showShipForm ? <X size={13} /> : <Plus size={13} />}
          {showShipForm ? 'Cancel' : 'Add Entry'}
        </button>
      </div>

      <div>
        {/* Add Entry Form */}
        {showShipForm && (
          <form onSubmit={handleShipSubmit} style={{
            background: 'var(--bg-panel)',
            borderRadius: '12px',
            border: '1px solid var(--border-accent)',
            padding: '20px',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>
              New Ship Log Entry
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', marginBottom: '10px' }}>
              <input
                value={shipForm.title}
                onChange={e => setShipForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Title \u2014 what did you ship?"
                required
                aria-label="Ship log title"
                style={{
                  background: 'var(--bg-dark)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                  width: '100%',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  type="date"
                  value={shipForm.date}
                  onChange={e => setShipForm(f => ({ ...f, date: e.target.value }))}
                  required
                  aria-label="Ship date"
                  style={{
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '9px 10px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    colorScheme: 'dark',
                  }}
                />
              </div>
            </div>
            <textarea
              value={shipForm.description}
              onChange={e => setShipForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (supports **bold**, *italic*, `code`, - lists)"
              aria-label="Ship log description"
              rows={4}
              style={{
                width: '100%',
                background: 'var(--bg-dark)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '9px 12px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'monospace',
                lineHeight: 1.6,
                marginBottom: '10px',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Tag size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                value={shipForm.tags}
                onChange={e => setShipForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="Tags: feature, bugfix, infra (comma separated)"
                aria-label="Ship log tags"
                style={{
                  flex: 1,
                  background: 'var(--bg-dark)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowShipForm(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '7px',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={shipSubmitting || !shipForm.title.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'var(--purple-a20)',
                  color: 'var(--accent-bright)',
                  opacity: shipSubmitting ? 0.6 : 1,
                }}
              >
                {shipSubmitting ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </form>
        )}

        {shipLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading entries...</div>
        ) : entries.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No entries yet. Start logging what you ship.</div>
        ) : (
          <div>
            {Object.entries(shipGroups).map(([month, monthEntries]) => (
              <div key={month} style={{ marginBottom: '28px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: '10px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  {month}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {monthEntries.map(entry => (
                    <div
                      key={entry.id}
                      style={{
                        background: 'var(--bg-panel)',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: entry.description ? '8px' : '0' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {entry.title}
                            </span>
                            {entry.tags && entry.tags.length > 0 && entry.tags.map(tag => (
                              <span key={tag} style={{
                                padding: '1px 6px',
                                borderRadius: '20px',
                                fontSize: '10px',
                                fontWeight: 600,
                                background: 'var(--purple-a12)',
                                color: 'var(--accent)',
                                border: '1px solid var(--purple-a20)',
                              }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={10} />
                            {formatDay(entry.date)}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteShipEntry(entry.id)}
                          title="Delete entry"
                          aria-label="Delete entry"
                          style={{
                            padding: '4px',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            opacity: 0.5,
                          }}
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                      {entry.description && (
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                          <MarkdownText text={entry.description} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Ideas stats cards */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--active-bg)' }}>
        {IDEA_STATUS_META.map(({ status, label, color }) => {
          const count = ideas.filter(i => i.status === status).length
          const active = ideasFilter === status
          return (
            <button
              key={status}
              onClick={() => setIdeasFilter(active ? null : status)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '14px 22px',
                borderRadius: '10px',
                border: `1px solid ${active ? color : 'var(--border)'}`,
                background: active ? `${color}18` : 'var(--bg-dark)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                minWidth: '80px',
              }}
            >
              <span style={{ fontSize: '26px', fontWeight: 700, color: active ? color : 'var(--text-primary)', lineHeight: 1 }}>{count}</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: active ? color : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
