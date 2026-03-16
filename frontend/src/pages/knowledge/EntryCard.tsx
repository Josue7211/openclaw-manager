import { ExternalLink } from 'lucide-react'
import type { KnowledgeEntry } from './shared'

interface EntryCardProps {
  entry: KnowledgeEntry
  onClick: () => void
}

export function EntryCard({ entry, onClick }: EntryCardProps) {
  const excerpt = entry.content
    ? entry.content.slice(0, 180) + (entry.content.length > 180 ? '...' : '')
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
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--purple-a30)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 1px var(--purple-a10)'
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
              background: 'var(--purple-a08)',
              color: 'var(--accent)',
              border: '1px solid var(--purple-a15)',
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
