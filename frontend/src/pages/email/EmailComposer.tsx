import type { CSSProperties } from 'react'
import { PaperPlaneTilt, X } from '@phosphor-icons/react'
import type { ComposeState, EmailAccount } from './types'

interface EmailComposerProps {
  open: boolean
  account: EmailAccount | null
  compose: ComposeState
  sending: boolean
  sendError: string | null
  onChange: (next: ComposeState) => void
  onClose: () => void
  onSend: () => void
}

export function EmailComposer({
  open,
  account,
  compose,
  sending,
  sendError,
  onChange,
  onClose,
  onSend,
}: EmailComposerProps) {
  if (!open) return null

  return (
    <section
      aria-label="Compose email"
      style={{
        position: 'fixed',
        right: '26px',
        bottom: '26px',
        width: 'min(640px, calc(100vw - 52px))',
        height: 'min(720px, calc(100vh - 90px))',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: 'var(--bg-elevated)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>New message</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            From {account?.address ?? 'selected account'}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close composer" style={iconButtonStyle}>
          <X size={15} />
        </button>
      </header>

      <div style={{ padding: '12px 14px 0', display: 'grid', gap: '8px' }}>
        <input
          value={compose.to}
          onChange={event => onChange({ ...compose, to: event.target.value })}
          placeholder="To"
          aria-label="To"
          style={inputStyle}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <input
            value={compose.cc}
            onChange={event => onChange({ ...compose, cc: event.target.value })}
            placeholder="Cc"
            aria-label="Cc"
            style={inputStyle}
          />
          <input
            value={compose.bcc}
            onChange={event => onChange({ ...compose, bcc: event.target.value })}
            placeholder="Bcc"
            aria-label="Bcc"
            style={inputStyle}
          />
        </div>
        <input
          value={compose.subject}
          onChange={event => onChange({ ...compose, subject: event.target.value })}
          placeholder="Subject"
          aria-label="Subject"
          style={{ ...inputStyle, fontWeight: 750, color: 'var(--text-primary)' }}
        />
      </div>

      <textarea
        value={compose.body}
        onChange={event => onChange({ ...compose, body: event.target.value })}
        placeholder="Write your message..."
        aria-label="Message body"
        style={{
          flex: 1,
          margin: '12px 14px',
          resize: 'none',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          padding: '14px',
          fontSize: '14px',
          lineHeight: 1.7,
          outline: 'none',
        }}
      />

      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ color: sendError ? 'var(--danger, #ef4444)' : 'var(--text-muted)', fontSize: '12px', lineHeight: 1.4 }}>
          {sendError ?? 'Send uses the selected account identity through AgentMail access.'}
        </div>
        <button
          onClick={onSend}
          disabled={sending || !account}
          style={{
            border: 'none',
            borderRadius: '8px',
            background: sending || !account ? 'var(--bg-elevated)' : 'var(--accent)',
            color: sending || !account ? 'var(--text-muted)' : 'var(--text-on-color)',
            padding: '9px 14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: sending || !account ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <PaperPlaneTilt size={15} />
          {sending ? 'Sending' : 'Send'}
        </button>
      </footer>
    </section>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text-secondary)',
  padding: '9px 11px',
  fontSize: '13px',
  outline: 'none',
}

const iconButtonStyle: CSSProperties = {
  width: '30px',
  height: '30px',
  borderRadius: '7px',
  border: '1px solid var(--border)',
  background: 'var(--bg-panel)',
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
