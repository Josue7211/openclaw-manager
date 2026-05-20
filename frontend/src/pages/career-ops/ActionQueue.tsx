import type { LeadReminder } from '@/features/career-ops/types'
import { badgeStyle } from '@/features/career-ops/domain'

export function ActionQueue({
  reminders,
  onCreateReminders,
  reminderStatus,
  creatingReminders = false,
}: {
  reminders: LeadReminder[]
  onCreateReminders?: () => void
  reminderStatus?: string | null
  creatingReminders?: boolean
}) {
  return (
    <section
      aria-label="Action queue"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          Action queue
        </div>
        {onCreateReminders ? (
          <button
            type="button"
            onClick={onCreateReminders}
            disabled={creatingReminders || reminders.length === 0}
            style={{
              padding: '7px 10px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: reminders.length === 0 ? 'var(--bg-base)' : 'var(--accent-a10)',
              color: reminders.length === 0 ? 'var(--text-muted)' : 'var(--accent)',
              cursor: creatingReminders || reminders.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {creatingReminders ? 'Creating...' : 'Create reminders'}
          </button>
        ) : null}
      </div>
      {reminderStatus ? (
        <div style={{ marginTop: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          {reminderStatus}
        </div>
      ) : (
        <div style={{ height: '10px' }} />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
        {reminders.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
            Opportunity dossiers will appear here with a next action and due date.
          </div>
        ) : (
          reminders.map(reminder => (
            <div
              key={reminder.id}
              style={{
                padding: '8px 10px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--bg-base)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{reminder.label}</div>
                <span style={badgeStyle(reminder.stage)}>{reminder.stage}</span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {reminder.detail}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
