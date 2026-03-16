import { X, ExternalLink, Trash2 } from 'lucide-react'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import type { KnowledgeEntry } from './shared'

interface SlidePanelProps {
  entry: KnowledgeEntry
  onClose: () => void
  onDelete: () => void
}

export function SlidePanel({ entry, onClose, onDelete }: SlidePanelProps) {
  const trapRef = useFocusTrap(true)
  useEscapeKey(onClose)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--overlay-light)',
          zIndex: 200,
        }}
      />
      {/* Panel */}
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={entry.title} style={{
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
                  background: 'var(--purple-a08)',
                  color: 'var(--accent)',
                  border: '1px solid var(--purple-a15)',
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
                background: 'var(--purple-a08)',
                borderRadius: '6px',
                border: '1px solid var(--purple-a15)',
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
