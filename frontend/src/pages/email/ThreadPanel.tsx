import type { CSSProperties } from 'react'
import { Archive, ArrowBendUpLeft, ArrowBendUpRight, EnvelopeSimple, PaperPlaneTilt, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import type { MailThread } from './types'
import { formatDate } from './types'

interface ThreadPanelProps {
  thread: MailThread | null
  accountLabel: string | null
  onPrepareDraft: () => void
  onComposeReply: () => void
  onComposeForward: () => void
  onArchive: () => void
  onTrash: () => void
}

export function ThreadPanel({
  thread,
  accountLabel,
  onPrepareDraft,
  onComposeReply,
  onComposeForward,
  onArchive,
  onTrash,
}: ThreadPanelProps) {
  if (!thread) {
    return (
      <div
        style={{
          borderRadius: 0,
          border: 'none',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          minHeight: 'calc(100vh - 150px)',
          overflow: 'hidden',
        }}
      >
        <EmptyState
          icon={EnvelopeSimple}
          title="Select a thread"
          description="Choose a thread to inspect sender identity, preview, and draft handoff state."
        />
      </div>
    )
  }

  return (
    <div
      style={{
        borderRadius: 0,
        border: 'none',
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        minHeight: 'calc(100vh - 150px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button title="Archive" onClick={onArchive} style={iconButtonStyle}><Archive size={15} /></button>
          <button title="Move to trash" onClick={onTrash} style={iconButtonStyle}><Trash size={15} /></button>
          <button title="Reply" onClick={onComposeReply} style={iconButtonStyle}><ArrowBendUpLeft size={15} /></button>
          <button title="Forward" onClick={onComposeForward} style={iconButtonStyle}><ArrowBendUpRight size={15} /></button>
        </div>
        <Button
          variant="primary"
          disabled={!accountLabel}
          onClick={onPrepareDraft}
          aria-label="Prepare draft"
          style={{ fontSize: '12px', padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <PaperPlaneTilt size={13} />
          Prepare Draft
        </Button>
      </div>

      <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '22px',
                fontWeight: 750,
                color: 'var(--text-primary)',
                lineHeight: 1.25,
                wordBreak: 'break-word',
              }}
            >
              {thread.subject}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginTop: '10px',
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <span>From {thread.from}</span>
              {thread.timestamp && <span>{new Date(thread.timestamp).toLocaleString()}</span>}
              {thread.message_count && thread.message_count > 1 && <span>{thread.message_count} messages</span>}
            </div>
          </div>
          <span
            style={{
              fontSize: '11px',
              borderRadius: '999px',
              padding: '3px 8px',
              background: accountLabel ? 'var(--purple-a08)' : 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: accountLabel ? 'var(--text-primary)' : 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {accountLabel ? `Replying as ${accountLabel}` : 'Identity unresolved'}
          </span>
        </div>
      </div>

      <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            paddingBottom: '16px',
            display: 'grid',
            gridTemplateColumns: '72px minmax(0, 1fr)',
            rowGap: '8px',
            columnGap: '12px',
            fontSize: '12px',
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>From</span>
          <span style={{ color: 'var(--text-primary)', minWidth: 0, wordBreak: 'break-word' }}>{thread.from}</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>To</span>
          <span style={{ color: 'var(--text-secondary)' }}>{accountLabel ?? 'Current mailbox'}</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Mailbox</span>
          <span style={{ color: 'var(--text-secondary)' }}>{accountLabel ?? 'Identity unresolved'}</span>
          {thread.timestamp && (
            <>
              <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Date</span>
              <span style={{ color: 'var(--text-secondary)' }}>{formatDate(thread.timestamp)}</span>
            </>
          )}
        </div>

        <div
          style={{
            fontSize: '14px',
            lineHeight: 1.75,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxWidth: '820px',
          }}
        >
          {thread.preview || 'No plain-text body came back from this provider yet.'}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '10px',
            marginTop: 'auto',
            paddingTop: '16px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button onClick={onComposeReply} style={actionButtonStyle}><ArrowBendUpLeft size={14} /> Reply</button>
          <button onClick={onComposeForward} style={actionButtonStyle}><ArrowBendUpRight size={14} /> Forward</button>
          <button onClick={onPrepareDraft} disabled={!accountLabel} style={actionButtonStyle}>
            <PaperPlaneTilt size={14} /> AI Draft
          </button>
        </div>
      </div>
    </div>
  )
}

const iconButtonStyle: CSSProperties = {
  width: '30px',
  height: '30px',
  borderRadius: '7px',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

const actionButtonStyle: CSSProperties = {
  minHeight: '38px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  fontWeight: 750,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '7px',
  cursor: 'pointer',
}
