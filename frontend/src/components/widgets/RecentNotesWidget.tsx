import React from 'react'
import { NotePencil, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useRecentNotes } from '@/lib/hooks/dashboard/useRecentNotes'
import type { WidgetProps } from '@/lib/widget-registry'

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export const RecentNotesWidget = React.memo(function RecentNotesWidget(_props: WidgetProps) {
  const { recentNotes, totalCount, mounted } = useRecentNotes()
  const navigate = useNavigate()

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <NotePencil size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Recent Notes
        </span>
        {mounted && totalCount > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            fontWeight: 600, lineHeight: 1,
          }}>
            {totalCount}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
          {recentNotes.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No notes yet
            </div>
          ) : (
            recentNotes.map(note => (
              <div
                key={note._id}
                className="hover-bg"
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)',
                  lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {note.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  {note.folder && (
                    <span style={{
                      fontSize: '10px', color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {note.folder}
                    </span>
                  )}
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)',
                    fontFamily: 'monospace', flexShrink: 0, marginLeft: 'auto',
                  }}>
                    {relativeTime(note.updated_at)}
                  </span>
                </div>
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/notes')}
            aria-label="View all notes"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto',
              paddingTop: '8px', fontSize: '11px', color: 'var(--accent)',
              background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            }}
          >
            View all <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
})
