


import { useEffect, useState, useRef } from 'react'
import { BookOpen, X, ExternalLink, Trash2, Plus, Search } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_BASE } from '@/lib/api'
import { SkeletonList } from '@/components/Skeleton'

interface KnowledgeEntry {
  id: string
  title: string
  content?: string
  source_url?: string
  tags: string[]
  created_at: string
  updated_at: string
}

function TagChip({ tag, active, onClick }: { tag: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: active ? 600 : 400,
        background: active ? 'rgba(155,132,236,0.25)' : 'rgba(155,132,236,0.08)',
        color: active ? 'var(--accent-bright)' : 'var(--accent)',
        border: `1px solid ${active ? 'rgba(155,132,236,0.4)' : 'rgba(155,132,236,0.15)'}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {tag}
    </button>
  )
}

function SlidePanel({ entry, onClose, onDelete }: { entry: KnowledgeEntry; onClose: () => void; onDelete: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 200,
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '520px',
        maxWidth: '90vw',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        zIndex: 201,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* Panel header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-panel)',
          zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {entry.title}
          </h2>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={onDelete}
              title="Delete entry"
              aria-label="Delete entry"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Panel body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {entry.tags.map(tag => (
                <span key={tag} style={{
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: 'rgba(155,132,236,0.08)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(155,132,236,0.15)',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Source URL */}
          {entry.source_url && (
            <a
              href={entry.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: 'var(--accent)',
                textDecoration: 'none',
                padding: '6px 10px',
                background: 'rgba(155,132,236,0.08)',
                borderRadius: '6px',
                border: '1px solid rgba(155,132,236,0.15)',
                width: 'fit-content',
              }}
            >
              <ExternalLink size={12} />
              View Source
            </a>
          )}

          {/* Content */}
          {entry.content ? (
            <div style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {entry.content}
            </div>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No content
            </div>
          )}

          {/* Metadata */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Created</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
            {entry.updated_at && entry.updated_at !== entry.created_at && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Updated</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(entry.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function AddEntryModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      const res = await fetch(`${API_BASE}/api/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, tags, source_url: sourceUrl || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add entry')
      onAdded()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: '6px',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '24px',
          width: '480px',
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Add Knowledge Entry</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Entry title"
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Content</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Notes, article content, learnings..."
              rows={6}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsRaw}
              onChange={e => setTagsRaw(e.target.value)}
              placeholder="ai, productivity, design"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Source URL (optional)</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--red)', background: 'rgba(240,71,71,0.1)', padding: '8px 10px', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: 'rgba(155,132,236,0.2)',
              color: 'var(--accent-bright)',
              fontWeight: 600,
              fontSize: '13px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Adding...' : 'Add Entry'}
          </button>
        </form>
      </div>
    </div>
  )
}

function EntryCard({ entry, onClick }: { entry: KnowledgeEntry; onClick: () => void }) {
  const excerpt = entry.content
    ? entry.content.slice(0, 180) + (entry.content.length > 180 ? '…' : '')
    : null

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-panel)',
        borderRadius: '10px',
        border: '1px solid var(--border)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(155,132,236,0.3)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 1px rgba(155,132,236,0.1)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
        {entry.title}
      </div>

      {excerpt && (
        <p style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          {excerpt}
        </p>
      )}

      {entry.tags && entry.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {entry.tags.map(tag => (
            <span key={tag} style={{
              padding: '2px 8px',
              borderRadius: '20px',
              fontSize: '10px',
              fontWeight: 500,
              background: 'rgba(155,132,236,0.08)',
              color: 'var(--accent)',
              border: '1px solid rgba(155,132,236,0.15)',
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        {entry.source_url && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <ExternalLink size={10} />
            Source
          </span>
        )}
      </div>
    </div>
  )
}

export default function KnowledgePage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: entriesData, isLoading } = useQuery<{ entries: KnowledgeEntry[] }>({
    queryKey: ['knowledge', debouncedSearch, tagFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('q', debouncedSearch)
      if (tagFilter) params.set('tag', tagFilter)
      const res = await fetch(`${API_BASE}/api/knowledge?${params}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
  })

  const entries = entriesData?.entries ?? []

  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const handleTagFilter = (tag: string) => {
    const next = tagFilter === tag ? null : tag
    setTagFilter(next)
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${API_BASE}/api/knowledge?id=${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })

  const handleDelete = async (id: string) => {
    setSelected(null)
    await deleteMutation.mutateAsync(id)
  }

  const allTags = Array.from(new Set(entries.flatMap(e => e.tags || [])))

  useEffect(() => {
    // auto-focus is handled by the search input
  }, [])

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Knowledge Base</h1>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              Notes · Articles · Links · Learnings
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            background: 'rgba(155,132,236,0.2)',
            color: 'var(--accent-bright)',
            fontWeight: 600,
            fontSize: '13px',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={14} />
          Add Entry
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <Search size={14} style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }} />
        <input
          type="search"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search title, content..."
          style={{
            width: '100%',
            padding: '10px 14px 10px 36px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
          {tagFilter && (
            <TagChip
              tag={`✕ ${tagFilter}`}
              active
              onClick={() => setTagFilter(null)}
            />
          )}
          {allTags.filter(t => t !== tagFilter).map(tag => (
            <TagChip key={tag} tag={tag} onClick={() => handleTagFilter(tag)} />
          ))}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <SkeletonList count={3} lines={3} layout="grid" />
      ) : entries.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 0',
          color: 'var(--text-muted)',
          fontSize: '13px',
        }}>
          {search || tagFilter
            ? 'No entries match your filters'
            : 'No knowledge entries yet — add a note, article, or link'}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
        }}>
          {entries.map(entry => (
            <EntryCard key={entry.id} entry={entry} onClick={() => setSelected(entry)} />
          ))}
        </div>
      )}

      {/* Slide-in panel */}
      {selected && (
        <SlidePanel
          entry={selected}
          onClose={() => setSelected(null)}
          onDelete={() => handleDelete(selected.id)}
        />
      )}

      {/* Add modal */}
      {showModal && (
        <AddEntryModal
          onClose={() => setShowModal(false)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['knowledge'] })}
        />
      )}
    </div>
  )
}
