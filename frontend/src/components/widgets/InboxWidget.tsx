import React, { useMemo } from 'react'
import { Envelope, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useInboxWidget } from '@/lib/hooks/dashboard/useInboxWidget'
import type { WidgetProps } from '@/lib/widget-registry'

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export const InboxWidget = React.memo(function InboxWidget({ config }: WidgetProps) {
  const { emails, recentUnread, unreadCount, mounted } = useInboxWidget()
  const navigate = useNavigate()

  const maxEmails = Number(config.maxEmails ?? 3)
  const showRead = Boolean(config.showRead ?? false)
  const displayEmails = useMemo(() => {
    const source = showRead ? emails : recentUnread
    return source
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, maxEmails)
  }, [emails, recentUnread, showRead, maxEmails])

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Envelope size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Inbox
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
          {displayEmails.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              {showRead ? 'No emails' : 'No unread emails'}
            </div>
          ) : (
            displayEmails.map(email => (
              <div
                key={email.id}
                className="hover-bg"
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '120px', flexShrink: 0,
                  }}>
                    {email.from}
                  </span>
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)',
                    fontFamily: 'monospace', flexShrink: 0, marginLeft: 'auto',
                  }}>
                    {relativeTime(email.date)}
                  </span>
                </div>
                <div style={{
                  fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)',
                  lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', marginTop: '2px',
                }}>
                  {email.subject}
                </div>
              </div>
            ))
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/email')}
            aria-label="View all emails"
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
