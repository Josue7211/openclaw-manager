import { EnvelopeSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import type { MailThread } from './types'

interface ThreadPanelProps {
  thread: MailThread | null
  accountLabel: string | null
  onPrepareDraft: () => void
}

export function ThreadPanel({ thread, accountLabel, onPrepareDraft }: ThreadPanelProps) {
  if (!thread) {
    return (
      <div
        style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
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
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {thread.subject}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              From {thread.from}
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

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Preview
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {thread.preview || '(no preview available)'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Policy
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Drafts can be prepared here. Sending remains blocked by AgentShell draft-only policy.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            disabled={!accountLabel}
            onClick={onPrepareDraft}
            aria-label="Prepare draft"
            style={{ fontSize: '12px', padding: '7px 12px' }}
          >
            Prepare Draft
          </Button>
        </div>
      </div>
    </div>
  )
}
