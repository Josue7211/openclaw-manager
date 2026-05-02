import { EnvelopeSimple } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import type { DraftItem } from './types'

interface DraftQueueProps {
  drafts: DraftItem[]
}

export function DraftQueue({ drafts }: DraftQueueProps) {
  if (drafts.length === 0) {
    return (
      <div
        style={{
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Draft Queue
          </div>
        </div>
        <EmptyState
          icon={EnvelopeSimple}
          title="No drafts yet"
          description="Select a thread with a resolved sender identity to prepare a draft review."
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
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Draft Queue
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px' }}>
        {drafts.map((draft) => (
          <section
            key={draft.id}
            style={{
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              padding: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
              <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                {draft.account_label}
              </strong>
              <span
                style={{
                  fontSize: '11px',
                  textTransform: 'lowercase',
                  color: 'var(--amber-warm)',
                  background: 'var(--warning-a08)',
                  border: '1px solid var(--warning-a25)',
                  borderRadius: '999px',
                  padding: '2px 8px',
                }}
              >
                {draft.handoff_status.replaceAll('_', ' ')}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {draft.subject}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {draft.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
