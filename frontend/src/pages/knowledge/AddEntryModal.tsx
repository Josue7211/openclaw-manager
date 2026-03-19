import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'

interface AddEntryModalProps {
  onClose: () => void
  onAdded: () => void
}

export function AddEntryModal({ onClose, onAdded }: AddEntryModalProps) {
  const trapRef = useFocusTrap(true)
  useEscapeKey(onClose)

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
      await api.post('/api/knowledge', { title, content, tags, source_url: sourceUrl || undefined })
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
        background: 'var(--overlay-heavy)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-knowledge-title"
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
          <h2 id="add-knowledge-title" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Add Knowledge Entry</h2>
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
              aria-label="Entry title"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Content</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Notes, article content, learnings..."
              aria-label="Entry content"
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
              aria-label="Tags"
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
              aria-label="Source URL"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--red)', background: 'var(--red-a12)', padding: '8px 10px', borderRadius: '6px' }}>
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
              background: 'var(--purple-a20)',
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
