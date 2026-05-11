import { useState, useCallback } from 'react'
import { Star } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import type { Email, Folder, MailThread } from './types'
import { formatDate } from './types'

interface EmailListProps {
  threads: MailThread[]
  selectedAccountId: string | null
  folder: Folder
  onInvalidateEmails: () => void
  selectedThreadId: string | null
  onSelectThread: (thread: MailThread) => void
  emptyTitle?: string
  emptyDescription?: string
  starredIds: Set<string>
  onToggleStar: (threadId: string) => void
}

function threadSupportsReadMutation(thread: MailThread) {
  return !thread.id.startsWith('thr_')
}

function threadToLegacyEmail(thread: MailThread, folder: Folder): Email {
  return {
    id: thread.id,
    from: thread.from,
    subject: thread.subject,
    date: thread.timestamp || new Date().toISOString(),
    preview: thread.preview,
    read: !thread.unread,
    folder,
  }
}

export function EmailList({
  threads,
  selectedAccountId,
  folder,
  onInvalidateEmails,
  selectedThreadId,
  onSelectThread,
  emptyTitle = 'No mail in this folder',
  emptyDescription = 'Refresh or check account settings if expected messages are missing.',
  starredIds,
  onToggleStar,
}: EmailListProps) {
  const [markingRead, setMarkingRead] = useState<Set<string>>(new Set())

  const handleMarkRead = useCallback(
    async (thread: MailThread) => {
      if (!threadSupportsReadMutation(thread)) return

      const email = threadToLegacyEmail(thread, folder)
      if (email.read || markingRead.has(email.id)) return
      setMarkingRead(prev => new Set(prev).add(email.id))
      try {
        await api.patch('/api/email', { id: email.id, read: true, account_id: selectedAccountId })
        onInvalidateEmails()
      } catch {
        // silently ignore
      } finally {
        setMarkingRead(prev => {
          const s = new Set(prev)
          s.delete(email.id)
          return s
        })
      }
    },
    [folder, markingRead, selectedAccountId, onInvalidateEmails],
  )

  const selectThread = useCallback(
    (thread: MailThread) => {
      onSelectThread(thread)
      handleMarkRead(thread)
    },
    [handleMarkRead, onSelectThread],
  )

  if (threads.length === 0) {
    return (
      <div
        style={{
          border: 'none',
          borderRadius: 0,
          background: 'var(--bg-panel)',
          padding: '64px 24px',
          textAlign: 'center',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
          {emptyTitle}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>{emptyDescription}</div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: 'none',
        borderTop: 'none',
        borderRadius: 0,
        overflowY: 'auto',
        background: 'var(--bg-panel)',
        flex: 1,
        minHeight: 0,
      }}
    >
      {threads.map(thread => {
        const email = threadToLegacyEmail(thread, folder)
        const isSelected = selectedThreadId === thread.id
        const starred = starredIds.has(thread.id)
        const messageCount = thread.message_count ?? 1
        return (
          <div
            key={thread.id}
            role="button"
            tabIndex={0}
            onClick={() => selectThread(thread)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                selectThread(thread)
              }
            }}
            style={{
              width: '100%',
              borderBottom: '1px solid var(--border)',
              borderLeft: isSelected ? '4px solid var(--accent)' : '4px solid transparent',
              background: isSelected ? 'var(--purple-a08)' : email.read ? 'var(--bg-panel)' : 'var(--bg-elevated)',
              transition: 'all 0.15s',
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '28px 28px minmax(96px, 0.75fr) minmax(0, 1.45fr) 70px',
              alignItems: 'center',
              gap: '8px',
              minHeight: '52px',
              flexShrink: 0,
              padding: '9px 13px 9px 9px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <input
              type="checkbox"
              aria-label={`Select ${email.subject}`}
              onClick={event => event.stopPropagation()}
              style={{
                width: '14px',
                height: '14px',
                accentColor: 'var(--accent)',
              }}
            />
            <span
              role="button"
              aria-label={starred ? 'Unstar thread' : 'Star thread'}
              tabIndex={0}
              onClick={event => {
                event.stopPropagation()
                onToggleStar(thread.id)
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onToggleStar(thread.id)
                }
              }}
              style={{
                color: starred ? 'var(--amber-warm)' : 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Star size={15} weight={starred ? 'fill' : 'regular'} />
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: email.read ? 550 : 800,
                color: email.read ? 'var(--text-secondary)' : 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {email.from}
            </span>
            <span style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: email.read ? 600 : 800,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {email.subject}
              </span>
              {messageCount > 1 && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    border: '1px solid var(--border)',
                    borderRadius: '999px',
                    padding: '1px 6px',
                    flexShrink: 0,
                  }}
                >
                  {messageCount}
                </span>
              )}
              {email.preview && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {email.preview}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: '11px',
                color: email.read ? 'var(--text-muted)' : 'var(--text-primary)',
                fontWeight: email.read ? 600 : 800,
                fontFamily: 'monospace',
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}
            >
              {formatDate(email.date)}
            </span>
            {!email.read && (
              <span
                style={{
                  position: 'absolute',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  marginLeft: '2px',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
