



import { useEffect, useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Envelope, ArrowsClockwise, WarningCircle, Gear } from '@phosphor-icons/react'
import { ErrorState } from '@/components/ui/ErrorState'
import { SkeletonList } from '@/components/Skeleton'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { PageHeader } from '@/components/PageHeader'
import type { Email, EmailAccount, AccountForm, DraftItem, Folder, MailThread } from './email/types'
import { FOLDERS, EMPTY_FORM } from './email/types'
import { ManagePanel } from './email/ManagePanel'
import { AccountSwitcher } from './email/AccountSwitcher'
import { EmailList } from './email/EmailList'
import { ThreadPanel } from './email/ThreadPanel'
import { DraftQueue } from './email/DraftQueue'

function mapEmailsToThreads(emails: Email[]): MailThread[] {
  return emails.map((email) => ({
    id: email.id,
    account_id: null,
    subject: email.subject,
    from: email.from,
    preview: email.preview,
    unread: !email.read,
  }))
}

const DEV_AGENTMAIL_ACCOUNTS: EmailAccount[] = import.meta.env.DEV ? [{
  id: 'josue@aparcedo.org',
  label: 'Aparcedo',
  provider: 'agentmail',
  address: 'josue@aparcedo.org',
  agentmail_inbox_id: 'clawcontrol-josue-aparcedo@agentmail.to',
  forwarding_status: 'active',
  is_default: true,
}] : []

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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const accountInitRef = useRef(false)

  // Load accounts via useQuery
  const { data: accountsData } = useQuery<{ accounts: EmailAccount[] }>({
    queryKey: queryKeys.emailAccounts,
    queryFn: async () => {
      const resp = await api.get<{ accounts?: EmailAccount[]; data?: { accounts?: EmailAccount[] } }>('/api/mail-accounts')
      return { accounts: resp.accounts ?? resp.data?.accounts ?? [] }
    },
  })

  const loadedAccounts = accountsData?.accounts ?? []
  const accounts = loadedAccounts.length > 0 ? loadedAccounts : DEV_AGENTMAIL_ACCOUNTS
  const defaultAccount = accounts.find(a => a.is_default) || accounts[0] || null
  const effectiveSelectedAccountId = selectedAccountId ?? defaultAccount?.id ?? null

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
  const { data: emailsData, isLoading: loading, error: emailsError, refetch: refetchEmails } = useQuery<{ threads?: MailThread[]; emails?: Email[]; error?: string }>({
    queryKey: queryKeys.emails(folder, effectiveSelectedAccountId ?? undefined),
    queryFn: () => {
      const params = new URLSearchParams({ folder })
      if (effectiveSelectedAccountId) params.set('account_id', effectiveSelectedAccountId)
      return api.get<{ threads?: MailThread[]; emails?: Email[]; error?: string }>(`/api/email?${params}`)
    },
  })

  const threads = emailsData?.threads ?? mapEmailsToThreads(emailsData?.emails ?? [])
  const missingCreds = emailsData?.error === 'missing_credentials'
  const error = emailsError ? (emailsError instanceof Error ? emailsError.message : 'Failed to fetch') : (emailsData?.error && emailsData.error !== 'missing_credentials' ? emailsData.error : null)

  const invalidateAccounts = () => queryClient.invalidateQueries({ queryKey: queryKeys.emailAccounts })
  const invalidateEmails = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.emails(folder, effectiveSelectedAccountId ?? undefined) }), [queryClient, folder, effectiveSelectedAccountId])

  const selectAccount = useCallback((id: string) => {
    setSelectedAccountId(id)
    if (typeof window !== 'undefined') localStorage.setItem('email_account_id', id)
  }, [])

  // Manage accounts panel
  const openAddForm = () => {
    setEditingAccount(null)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  const openEditForm = (acc: EmailAccount) => {
    setEditingAccount(acc)
    setForm({
      label: acc.label,
      provider: acc.provider,
      address: acc.address,
      agentmail_inbox_id: acc.agentmail_inbox_id,
      forwarding_status: acc.forwarding_status,
      is_default: acc.is_default,
    })
    setFormError(null)
  }

  const handleFormSave = async () => {
    if (!form.label || !form.provider || !form.address) {
      setFormError('Label, provider, and address are required')
      return
    }
    setFormSaving(true)
    setFormError(null)
    try {
      const body: Record<string, unknown> = {
        label: form.label,
        provider: form.provider,
        address: form.address,
        agentmail_inbox_id: form.agentmail_inbox_id,
        forwarding_status: form.forwarding_status,
        is_default: form.is_default,
      }

      let data: { error?: string }
      if (editingAccount) {
        body.id = editingAccount.id
        data = await api.patch<{ error?: string }>('/api/mail-accounts', body)
      } else {
        data = await api.post<{ error?: string }>('/api/mail-accounts', body)
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
      await api.del(`/api/mail-accounts?id=${id}`)
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
      await api.patch('/api/mail-accounts', { id, is_default: true })
      invalidateAccounts()
      accountInitRef.current = false
    } catch (e) {
      console.error('handleSetDefault failed:', e)
    }
  }

  const unreadCount = threads.filter(thread => thread.unread).length
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null
  const selectedThreadAccount = accounts.find((account) => account.id === (selectedThread?.account_id ?? effectiveSelectedAccountId))

  useEffect(() => {
    if (!selectedThread && threads.length > 0) {
      setSelectedThreadId(threads[0].id)
    }
  }, [selectedThread, threads])

  const handlePrepareDraft = useCallback(() => {
    if (!selectedThread || !selectedThreadAccount) return

    void (async () => {
      try {
        const response = await api.post<{ draft?: DraftItem }>('/api/email/drafts', {
          thread_id: selectedThread.id,
          account_id: selectedThreadAccount.id,
          subject: selectedThread.subject,
          from: selectedThread.from,
          preview: selectedThread.preview,
        })

        if (!response.draft) return

        setDrafts((current) => {
          const withoutExisting = current.filter((draft) => draft.id !== response.draft?.id)
          return [response.draft as DraftItem, ...withoutExisting]
        })
      } catch (error) {
        console.error('handlePrepareDraft failed:', error)
      }
    })()
  }, [selectedThread, selectedThreadAccount])

  const handleCloseManagePanel = useCallback(() => {
    setManageOpen(false)
    setEditingAccount(null)
    setForm(EMPTY_FORM)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingAccount(null)
    setForm(EMPTY_FORM)
  }, [])

  const managePanelNode = manageOpen && (
    <ManagePanel
      accounts={accounts}
      editingAccount={editingAccount}
      form={form}
      formSaving={formSaving}
      formError={formError}
      deletingId={deletingId}
      onClose={handleCloseManagePanel}
      onSetForm={setForm}
      onOpenEditForm={openEditForm}
      onCancelEdit={handleCancelEdit}
      onFormSave={handleFormSave}
      onDelete={handleDelete}
      onSetDefault={handleSetDefault}
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
            Link a mail account via <strong>Manage Accounts</strong> using its provider, address, and mapped AgentMail inbox ID.
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
            selectedAccountId={effectiveSelectedAccountId}
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
        <ErrorState resource="emails" onRetry={() => refetchEmails()} />
      )}

      {/* Missing creds banner (accounts exist but selected has issue) */}
      {missingCreds && accounts.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          background: 'var(--warning-a08)', border: '1px solid var(--warning-a25)',
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)', gap: '16px', alignItems: 'start' }}>
          <EmailList
            threads={threads}
            selectedAccountId={effectiveSelectedAccountId}
            folder={folder}
            onInvalidateEmails={invalidateEmails}
            selectedThreadId={selectedThread?.id ?? null}
            onSelectThread={(thread) => setSelectedThreadId(thread.id)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <ThreadPanel
              thread={selectedThread}
              accountLabel={selectedThreadAccount?.label ?? null}
              onPrepareDraft={handlePrepareDraft}
            />
            <DraftQueue drafts={drafts} />
          </div>
        </div>
      )}

      {/* Manage accounts panel */}
      {managePanelNode}
    </div>
  )
}
