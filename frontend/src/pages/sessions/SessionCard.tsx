import React from 'react'
import SecondsAgo from '@/components/SecondsAgo'
import type { ClaudeSession } from './types'

interface SessionCardProps {
  session: ClaudeSession
  selected: boolean
  onSelect: () => void
}

export const SessionCard = React.memo(function SessionCard({
  session,
  selected,
  onSelect,
}: SessionCardProps) {
  const lastActivityMs = session.lastActivity
    ? new Date(session.lastActivity as string).getTime()
    : Date.now()

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        background: selected ? 'var(--active-bg)' : 'var(--bg-card)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: `1px solid ${selected ? 'var(--accent)44' : 'var(--border)'}`,
        borderRadius: '16px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'border-color 0.3s, background 0.15s',
        fontFamily: 'inherit',
        color: 'inherit',
      }}
    >
      {/* Label */}
      <div style={{
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {(session.label as string) || 'Untitled'}
      </div>

      {/* Agent key */}
      <div style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {session.agentKey as string}
      </div>

      {/* Message count + timestamp row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '11px',
        color: 'var(--text-muted)',
      }}>
        <span>{session.messageCount as number} messages</span>
        <SecondsAgo sinceMs={lastActivityMs} />
      </div>
    </button>
  )
})
