import { useCallback } from 'react'
import { Star, Trash, X, EnvelopeSimple } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import type { EmailAccount, AccountForm } from './types'

interface ManagePanelProps {
  accounts: EmailAccount[]
  editingAccount: EmailAccount | null
  form: AccountForm
  formSaving: boolean
  formError: string | null
  deletingId: string | null
  onClose: () => void
  onSetForm: (updater: (f: AccountForm) => AccountForm) => void
  onOpenEditForm: (acc: EmailAccount) => void
  onCancelEdit: () => void
  onFormSave: () => void
  onDelete: (id: string) => void
  onSetDefault: (id: string) => void
}

const inputStyle = {
  width: '100%', padding: '7px 10px', borderRadius: '6px', fontSize: '12px',
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' as const,
}
const labelStyle = { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' as const }

export function ManagePanel({
  accounts,
  editingAccount,
  form,
  formSaving,
  formError,
  deletingId,
  onClose,
  onSetForm,
  onOpenEditForm,
  onCancelEdit,
  onFormSave,
  onDelete,
  onSetDefault,
}: ManagePanelProps) {
  const trapRef = useFocusTrap(true)

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEscapeKey(handleClose)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, background: 'var(--overlay-light)', zIndex: 99,
        }}
      />
      {/* Slide-in panel */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Manage Email Accounts"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px',
          background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)',
          zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>Manage Email Accounts</span>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Account list */}
          {accounts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {accounts.map(acc => (
                <div key={acc.id} style={{
                  borderRadius: '8px', border: '1px solid var(--border)',
                  background: editingAccount?.id === acc.id ? 'var(--purple-a08)' : 'var(--bg-elevated)',
                  padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{acc.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acc.address} · {acc.provider} · AgentMail {acc.agentmail_inbox_id ? 'linked' : 'not linked'}
                    </div>
                  </div>
                  {acc.is_default && (
                    <span style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                      background: 'var(--purple-a15)', color: 'var(--accent)', fontWeight: 600,
                    }}>default</span>
                  )}
                  {!acc.is_default && (
                    <button
                      onClick={() => onSetDefault(acc.id)}
                      title="Set as default"
                      aria-label="Set as default"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                    >
                      <Star size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => onOpenEditForm(acc)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', padding: '2px', fontSize: '11px',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(acc.id)}
                    disabled={deletingId === acc.id}
                    aria-label="Delete account"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                  >
                    <Trash size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add / Edit form */}
          <div style={{
            borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--bg-elevated)', padding: '16px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
              {editingAccount ? `Edit: ${editingAccount.label}` : 'Add Account'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Label</label>
                <input style={inputStyle} placeholder="Personal, Work…" value={form.label} onChange={e => onSetForm(f => ({ ...f, label: e.target.value }))} aria-label="Account label" />
              </div>
              <div>
                <label style={labelStyle}>Provider</label>
                <select
                  style={inputStyle}
                  value={form.provider}
                  onChange={e => onSetForm(f => ({ ...f, provider: e.target.value }))}
                  aria-label="Mail provider"
                >
                  <option value="proton">Proton</option>
                  <option value="gmail">Gmail</option>
                  <option value="icloud">iCloud</option>
                  <option value="outlook">Outlook</option>
                  <option value="fastmail">Fastmail</option>
                  <option value="imap">Custom IMAP</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <input style={inputStyle} placeholder="you@example.com" value={form.address} onChange={e => onSetForm(f => ({ ...f, address: e.target.value }))} aria-label="Account address" />
              </div>
              <div>
                <label style={labelStyle}>AgentMail Access Inbox ID</label>
                <input style={inputStyle} placeholder="AgentMail inbox that brokers agent access" value={form.agentmail_inbox_id} onChange={e => onSetForm(f => ({ ...f, agentmail_inbox_id: e.target.value }))} aria-label="AgentMail access inbox id" />
              </div>
              <div>
                <label style={labelStyle}>Agent Access Status</label>
                <select
                  style={inputStyle}
                  value={form.forwarding_status}
                  onChange={e => onSetForm(f => ({ ...f, forwarding_status: e.target.value as AccountForm['forwarding_status'] }))}
                  aria-label="AgentMail access status"
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_default} onChange={e => onSetForm(f => ({ ...f, is_default: e.target.checked }))} />
                  Set as default
                </label>
              </div>

              {formError && (
                <div style={{ fontSize: '11px', color: 'var(--red-bright)' }}>{formError}</div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <Button
                  variant="primary"
                  onClick={onFormSave}
                  disabled={formSaving}
                  style={{ flex: 1, fontSize: '12px', padding: '8px' }}
                >
                  {formSaving ? 'Saving…' : editingAccount ? 'Save Changes' : 'Add Account'}
                </Button>
                {editingAccount && (
                  <Button
                    variant="secondary"
                    onClick={onCancelEdit}
                    style={{ fontSize: '12px', padding: '8px 14px' }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>

          {accounts.length === 0 && !editingAccount && (
            <div style={{ padding: '16px 0' }}>
              <EmptyState icon={EnvelopeSimple} title="No accounts yet" description="Add an email account above." />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
