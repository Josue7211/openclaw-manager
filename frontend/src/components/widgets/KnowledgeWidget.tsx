import React from 'react'
import { BookOpen, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { useKnowledgeWidget } from '@/lib/hooks/dashboard'
import type { WidgetProps } from '@/lib/widget-registry'

export const KnowledgeWidget = React.memo(function KnowledgeWidget({ config }: WidgetProps) {
  const { recentEntries, totalCount } = useKnowledgeWidget()
  const navigate = useNavigate()

  const maxItems = Number(config.maxItems ?? 5)
  const showTags = config.showTags !== undefined ? Boolean(config.showTags) : true
  const displayEntries = recentEntries.slice(0, maxItems)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={14} style={{ color: 'var(--accent)' }} />
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            Recent
          </span>
        </div>
        {totalCount > 0 && (
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent-a12)',
            padding: '2px 7px',
            borderRadius: '999px',
            fontFamily: 'monospace',
          }}>
            {totalCount}
          </span>
        )}
      </div>

      {/* Entry list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', minHeight: 0 }}>
        {displayEntries.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No knowledge entries yet
          </div>
        ) : (
          displayEntries.map(entry => (
            <div
              key={entry.id}
              className="hover-bg"
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-white-03)',
                transition: 'all 0.2s var(--ease-spring)',
              }}
            >
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {entry.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                {showTags && entry.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', overflow: 'hidden', flex: 1 }}>
                    {entry.tags.slice(0, 2).map(tag => (
                      <span
                        key={tag}
                        style={{
                          display: 'inline-block',
                          padding: '1px 6px',
                          borderRadius: '999px',
                          fontSize: '9px',
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* View all link */}
      <button
        onClick={() => navigate('/knowledge')}
        aria-label="View all knowledge entries"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          marginTop: '10px',
          padding: '6px 0',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--accent)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '6px',
          transition: 'all 0.2s var(--ease-spring)',
        }}
        className="hover-bg"
      >
        View all <ArrowRight size={12} />
      </button>
    </div>
  )
})
