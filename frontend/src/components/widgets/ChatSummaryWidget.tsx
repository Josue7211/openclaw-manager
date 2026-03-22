import React from 'react'
import { Robot, ArrowRight, Plus } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useChatSummary } from '@/lib/hooks/dashboard/useChatSummary'
import type { WidgetProps } from '@/lib/widget-registry'

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`
  return `${Math.round(diff / 86_400_000)}d`
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}

export const ChatSummaryWidget = React.memo(function ChatSummaryWidget({ size }: WidgetProps) {
  const { threads, totalCount, mounted } = useChatSummary()
  const navigate = useNavigate()
  const showNewChat = size.w >= 2

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Robot size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          AI Chat
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0 }}>
          {threads.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No chat threads yet
            </div>
          ) : (
            threads.map(thread => (
              <div
                key={thread.id}
                className="hover-bg"
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                }}
                onClick={() => navigate('/chat')}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') navigate('/chat') }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {truncate(thread.title, 40)}
                  </span>
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)',
                    fontFamily: 'monospace', flexShrink: 0,
                  }}>
                    {relativeTime(thread.updatedAt)}
                  </span>
                </div>
                <div style={{ marginTop: '2px' }}>
                  <span style={{
                    display: 'inline-block', fontSize: '9px', padding: '1px 5px',
                    borderRadius: '4px', background: 'var(--bg-white-03)',
                    color: 'var(--text-muted)', fontWeight: 500,
                    border: '1px solid var(--border)',
                  }}>
                    {thread.model}
                  </span>
                </div>
              </div>
            ))
          )}

          {/* New chat button */}
          {showNewChat && (
            <button
              onClick={() => navigate('/chat')}
              aria-label="Start new chat"
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 8px', marginTop: '4px',
                fontSize: '11px', color: 'var(--text-muted)',
                background: 'none', border: '1px dashed var(--border)',
                borderRadius: '6px', cursor: 'pointer', fontWeight: 500,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              className="hover-bg"
            >
              <Plus size={10} /> New chat
            </button>
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/chat')}
            aria-label="View all chats"
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
