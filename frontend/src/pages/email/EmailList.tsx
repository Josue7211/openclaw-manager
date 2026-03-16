import { useState, useCallback } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import type { Email } from './types'
import { formatDate } from './types'

interface EmailListProps {
  emails: Email[]
  selectedAccountId: string | null
  onInvalidateEmails: () => void
}

export function EmailList({ emails, selectedAccountId, onInvalidateEmails }: EmailListProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [markingRead, setMarkingRead] = useState<Set<string>>(new Set())

  const handleMarkRead = useCallback(async (email: Email) => {
    if (email.read || markingRead.has(email.id)) return
    setMarkingRead(prev => new Set(prev).add(email.id))
    try {
      await api.patch('/api/email', { id: email.id, read: true, account_id: selectedAccountId })
      onInvalidateEmails()
    } catch {
      // silently ignore
    } finally {
      setMarkingRead(prev => { const s = new Set(prev); s.delete(email.id); return s })
    }
  }, [markingRead, selectedAccountId, onInvalidateEmails])

  const toggleExpand = useCallback((email: Email) => {
    setExpanded(prev => prev === email.id ? null : email.id)
    handleMarkRead(email)
  }, [handleMarkRead])

  if (emails.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
        No emails
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {emails.map(email => {
        const isExpanded = expanded === email.id
        return (
          <div
            key={email.id}
            style={{
              borderRadius: '8px',
              border: email.read ? '1px solid var(--border)' : '1px solid var(--purple-a30)',
              background: email.read ? 'var(--bg-panel)' : 'var(--purple-a08)',
              transition: 'all 0.15s',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => toggleExpand(email)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                width: '100%', padding: '12px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                background: email.read ? 'transparent' : 'var(--accent)',
              }} />
              <div style={{
                width: '160px', flexShrink: 0, fontSize: '13px',
                fontWeight: email.read ? 400 : 600,
                color: email.read ? 'var(--text-secondary)' : 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {email.from}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                <span style={{
                  fontSize: '13px', fontWeight: email.read ? 400 : 600,
                  color: 'var(--text-primary)', flexShrink: 0, maxWidth: '240px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {email.subject}
                </span>
                {email.preview && (
                  <span style={{
                    fontSize: '12px', color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    — {email.preview}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'monospace', marginLeft: '8px' }}>
                {formatDate(email.date)}
              </div>
              <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </div>
            </button>

            {isExpanded && (
              <div style={{ padding: '0 14px 14px 32px', borderTop: '1px solid var(--border)' }}>
                <div style={{
                  marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)',
                  lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {email.preview || '(no preview available)'}
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(email.date).toLocaleString()}
                  </span>
                  {!email.read && (
                    <button
                      onClick={() => handleMarkRead(email)}
                      disabled={markingRead.has(email.id)}
                      style={{
                        padding: '3px 10px', borderRadius: '6px', fontSize: '11px',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
