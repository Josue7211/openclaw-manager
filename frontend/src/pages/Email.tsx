



import { useEffect, useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Envelope, ArrowsClockwise, WarningCircle, Gear } from '@phosphor-icons/react'
import { SkeletonList } from '@/components/Skeleton'

import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import type { Email, EmailAccount, AccountForm, Folder } from './email/types'
import { FOLDERS, EMPTY_FORM } from './email/types'
import { ManagePanel } from './email/ManagePanel'
import { AccountSwitcher } from './email/AccountSwitcher'
import { EmailList } from './email/EmailList'

export default function EmailPage() {
  const queryClient = useQueryClient()

  const [folder, setFolder] = useState<Folder>('INBOX')

  // Multi-account state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null)
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const accountInitRef = useRef(false)

  // Load accounts via useQuery
  const { data: accountsData } = useQuery<{ accounts: EmailAccount[] }>({
    queryKey: ['email-accounts'],
    queryFn: () => api.get<{ accounts: EmailAccount[] }>('/api/email-accounts'),
  })

  const accounts = accountsData?.accounts ?? []

  // Initialise selected account from localStorage / default when accounts first load
  useEffect(() => {
    if (accounts.length === 0 || accountInitRef.current) return
    accountInitRef.current = true
    const stored = typeof window !== 'undefined' ? localStorage.getItem('email_account_id') : null
    const ids = accounts.map(a => a.id)
    if (stored && ids.includes(stored)) {
      setSelectedAccountId(stored)
    } else {
      const def = accounts.find(a => a.is_default) || accounts[0]
      if (def) {
        setSelectedAccountId(def.id)
        if (typeof window !== 'undefined') localStorage.setItem('email_account_id', def.id)
      }
    }
  }, [accounts])

  // Fetch emails via useQuery
  const { data: emailsData, isLoading: loading, error: emailsError, refetch: refetchEmails } = useQuery<{ emails?: Email[]; error?: string }>({
    queryKey: ['emails', folder, selectedAccountId],
    queryFn: () => {
      const params = new URLSearchParams({ folder })
      if (selectedAccountId) params.set('account_id', selectedAccountId)
      return api.get<{ emails?: Email[]; error?: string }>(`/api/email?${params}`)
    },
  })

  const emails = emailsData?.emails ?? []
  const missingCreds = emailsData?.error === 'missing_credentials'
  const error = emailsError ? (emailsError instanceof Error ? emailsError.message : 'Failed to fetch') : (emailsData?.error && emailsData.error !== 'missing_credentials' ? emailsData.error : null)

  const invalidateAccounts = () => queryClient.invalidateQueries({ queryKey: ['email-accounts'] })
  const invalidateEmails = useCallback(() => queryClient.invalidateQueries({ queryKey: ['emails'] }), [queryClient])

  const selectAccount = useCallback((id: string) => {
    setSelectedAccountId(id)
    if (typeof window !== 'undefined') localStorage.setItem('email_account_id', id)
  }, [])

  // Manage accounts panel
  const openAddForm = () => {
    setEditingAccount(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowPassword(false)
  }

  const openEditForm = (acc: EmailAccount) => {
    setEditingAccount(acc)
    setForm({
      label: acc.label,
      host: acc.host,
      port: String(acc.port),
      username: acc.username,
      password: '',
      tls: acc.tls,
      is_default: acc.is_default,
    })
    setFormError(null)
    setShowPassword(false)
  }

  const handleFormSave = async () => {
    if (!form.label || !form.host || !form.username) {
      setFormError('Label, host, and username are required')
      return
    }
    if (!editingAccount && !form.password) {
      setFormError('Password is required for new accounts')
      return
    }
    setFormSaving(true)
    setFormError(null)
    try {
      const body: Record<string, unknown> = {
        label: form.label, host: form.host, port: parseInt(form.port, 10) || 993,
        username: form.username, tls: form.tls, is_default: form.is_default,
      }
      if (form.password) body.password = form.password

      let data: { error?: string }
      if (editingAccount) {
        body.id = editingAccount.id
        data = await api.patch<{ error?: string }>('/api/email-accounts', body)
      } else {
        data = await api.post<{ error?: string }>('/api/email-accounts', body)
      }
      if (data.error) { setFormError(data.error); return }
      invalidateAccounts()
      accountInitRef.current = false
      setEditingAccount(null)
      setForm(EMPTY_FORM)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setFormSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await api.del(`/api/email-accounts?id=${id}`)
      invalidateAccounts()
      accountInitRef.current = false
      if (selectedAccountId === id) {
        setSelectedAccountId(null)
        if (typeof window !== 'undefined') localStorage.removeItem('email_account_id')
      }
      if (editingAccount?.id === id) { setEditingAccount(null); setForm(EMPTY_FORM) }
    } catch (e) {
      console.error('handleDelete failed:', e)
    } finally {
      setDeletingId(null)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await api.patch('/api/email-accounts', { id, is_default: true })
      invalidateAccounts()
      accountInitRef.current = false
    } catch (e) {
      console.error('handleSetDefault failed:', e)
    }
  }

  const unreadCount = emails.filter(e => !e.read).length

  const handleCloseManagePanel = useCallback(() => {
    setManageOpen(false)
    setEditingAccount(null)
    setForm(EMPTY_FORM)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingAccount(null)
    setForm(EMPTY_FORM)
  }, [])

  const handleToggleShowPassword = useCallback(() => {
    setShowPassword(p => !p)
  }, [])

  const managePanelNode = manageOpen && (
    <ManagePanel
      accounts={accounts}
      editingAccount={editingAccount}
      form={form}
      formSaving={formSaving}
      formError={formError}
      showPassword={showPassword}
      deletingId={deletingId}
      onClose={handleCloseManagePanel}
      onSetForm={setForm}
      onOpenEditForm={openEditForm}
      onCancelEdit={handleCancelEdit}
      onFormSave={handleFormSave}
      onDelete={handleDelete}
      onSetDefault={handleSetDefault}
      onToggleShowPassword={handleToggleShowPassword}
    />
  )

  if (missingCreds && accounts.length === 0) {
    return (
      <div style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <Envelope size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Email</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <WarningCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Email not configured</h2>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Add an IMAP account via <strong>Manage Accounts</strong> or set env vars in{' '}
            <code style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>.env.local</code>.
          </p>
          <button
            onClick={() => { setManageOpen(true); openAddForm() }}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: 'var(--accent)', color: 'var(--text-on-color)', border: 'none', cursor: 'pointer',
            }}
          >
            Add Account
          </button>
        </div>
        {managePanelNode}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Envelope size={20} style={{ color: 'var(--accent)' }} />
          <PageHeader defaultTitle="Email" />
          {!loading && unreadCount > 0 && (
            <span className="badge badge-green" style={{ marginLeft: '4px' }}>
              {unreadCount} unread
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AccountSwitcher
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={selectAccount}
          />

          {/* Manage Accounts */}
          <button
            onClick={() => { setManageOpen(true); if (!editingAccount) openAddForm() }}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-secondary)', padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
            }}
          >
            <Gear size={12} />
            Manage Accounts
          </button>

          {/* Refresh */}
          <button
            onClick={() => refetchEmails()}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-secondary)', padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
            }}
          >
            <ArrowsClockwise size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Folder tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {FOLDERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFolder(f.id)}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
              background: folder === f.id ? 'var(--accent)' : 'var(--bg-panel)',
              color: folder === f.id ? 'var(--text-on-color)' : 'var(--text-secondary)',
              border: folder === f.id ? '1px solid var(--accent)' : '1px solid var(--border)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          background: 'rgba(255,95,95,0.1)', border: '1px solid rgba(255,95,95,0.3)',
          color: 'var(--red-bright)', fontSize: '12px',
        }}>
          {error}
        </div>
      )}

      {/* Missing creds banner (accounts exist but selected has issue) */}
      {missingCreds && accounts.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.25)',
          color: 'var(--text-secondary)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <WarningCircle size={14} style={{ color: 'var(--amber-warm)', flexShrink: 0 }} />
          No credentials for this account. Select a different account or add credentials via Manage Accounts.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <SkeletonList count={3} lines={2} />
      )}

      {/* Email list */}
      {!loading && !error && !missingCreds && (
        <EmailList
          emails={emails}
          selectedAccountId={selectedAccountId}
          onInvalidateEmails={invalidateEmails}
        />
      )}

      {/* Manage accounts panel */}
      {managePanelNode}
    </div>
  )
}
