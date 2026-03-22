import React from 'react'
import { ChatCircle, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useMessagesSummary } from '@/lib/hooks/dashboard/useMessagesSummary'
import type { WidgetProps } from '@/lib/widget-registry'

function relativeTime(ts: number | null): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`
  return `${Math.round(diff / 86_400_000)}d`
}

function truncate(text: string | null, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

export const MessagesSummaryWidget = React.memo(function MessagesSummaryWidget({ size, config }: WidgetProps) {
  const { conversations, unreadCount, mounted } = useMessagesSummary()
  const navigate = useNavigate()
  const maxConversations = Number(config.maxConversations ?? 5)
  const compact = size.h <= 2
  const limit = compact ? Math.min(maxConversations, 3) : maxConversations
  const displayConvs = conversations.slice(0, limit)

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <ChatCircle size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Messages
        </span>
        {mounted && unreadCount > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--red-500)', color: '#fff',
            fontWeight: 600, lineHeight: 1,
          }}>
            {unreadCount}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0 }}>
          {displayConvs.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No recent conversations
            </div>
          ) : (
            displayConvs.map(conv => (
              <div
                key={conv.guid}
                className="hover-bg"
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                }}
                onClick={() => navigate('/messages')}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') navigate('/messages') }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: conv.hasUnread ? 700 : 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {conv.hasUnread && (
                      <span style={{
                        display: 'inline-block', width: '6px', height: '6px',
                        borderRadius: '50%', background: 'var(--accent)',
                        marginRight: '6px', verticalAlign: 'middle',
                      }} />
                    )}
                    {conv.displayName || 'Unknown'}
                  </span>
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)',
                    fontFamily: 'monospace', flexShrink: 0,
                  }}>
                    {relativeTime(conv.lastDate)}
                  </span>
                </div>
                <div style={{
                  fontSize: '11px', color: 'var(--text-muted)',
                  lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', marginTop: '2px',
                }}>
                  {truncate(conv.lastMessage, 40)}
                </div>
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/messages')}
            aria-label="View all messages"
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
