import type { CSSProperties } from 'react'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArrowsClockwise,
  Clock,
  Envelope,
  Gear,
  MagnifyingGlass,
  PencilSimple,
  Star,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import { ErrorState } from '@/components/ui/ErrorState'
import { SkeletonList } from '@/components/Skeleton'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { PageHeader } from '@/components/PageHeader'
import type { ComposeState, Email, EmailAccount, AccountForm, DraftItem, Folder, MailThread, SendEmailResponse } from './email/types'
import { FOLDERS, EMPTY_FORM } from './email/types'
import { ManagePanel } from './email/ManagePanel'
import { AccountSwitcher } from './email/AccountSwitcher'
import { EmailList } from './email/EmailList'
import { ThreadPanel } from './email/ThreadPanel'
import { DraftQueue } from './email/DraftQueue'
import { EmailComposer } from './email/EmailComposer'

function mapEmailsToThreads(emails: Email[]): MailThread[] {
  return emails.map(email => ({
    id: email.id,
    account_id: null,
    subject: email.subject,
    from: email.from,
    preview: email.preview,
    unread: !email.read,
    timestamp: email.date,
    message_count: 1,
  }))
}

const EMPTY_COMPOSE: ComposeState = {
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
}

const EMAIL_LIMIT = 100

function backendFolderFor(folder: Folder): string {
  if (folder === 'All' || folder === 'Unread' || folder === 'Starred') return 'INBOX'
  return folder
}

const DEV_AGENTMAIL_ACCOUNTS: EmailAccount[] = import.meta.env.DEV
  ? [
      {
        id: 'josue@aparcedo.org',
        label: 'Aparcedo',
        provider: 'agentmail',
        address: 'josue@aparcedo.org',
        agentmail_inbox_id: 'clawcontrol-josue-aparcedo@agentmail.to',
        forwarding_status: 'active',
        is_default: true,
      },
    ]
  : []

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
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [trashedIds, setTrashedIds] = useState<Set<string>>(new Set())
  const [composeOpen, setComposeOpen] = useState(false)
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [setupNotice, setSetupNotice] = useState<string | null>(null)
  const accountInitRef = useRef(false)

  // Load accounts via useQuery
  const { data: accountsData } = useQuery<{ accounts: EmailAccount[] }>({
    queryKey: queryKeys.emailAccounts,
    queryFn: async () => {
      const resp = await api.get<{ accounts?: EmailAccount[]; data?: { accounts?: EmailAccount[] } }>(
        '/api/mail-accounts',
      )
      return { accounts: resp.accounts ?? resp.data?.accounts ?? [] }
    },
  })

  const loadedAccounts = accountsData?.accounts
  const accounts =
    loadedAccounts && loadedAccounts.length > 0 ? loadedAccounts : accountsData ? DEV_AGENTMAIL_ACCOUNTS : []
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
  const {
    data: emailsData,
    isLoading: loading,
    error: emailsError,
    refetch: refetchEmails,
  } = useQuery<{ threads?: MailThread[]; emails?: Email[]; error?: string; source?: string }>({
    queryKey: queryKeys.emails(folder, effectiveSelectedAccountId ?? undefined),
    queryFn: () => {
      const params = new URLSearchParams({ folder: backendFolderFor(folder), limit: String(EMAIL_LIMIT) })
      if (effectiveSelectedAccountId) params.set('account_id', effectiveSelectedAccountId)
      return api.get<{ threads?: MailThread[]; emails?: Email[]; error?: string; source?: string }>(
        `/api/email?${params}`,
      )
    },
  })

  const threads = useMemo(() => emailsData?.threads ?? mapEmailsToThreads(emailsData?.emails ?? []), [emailsData])
  const visibleThreads = useMemo(
    () =>
      threads.filter(thread => {
        if (folder === 'Archive' && !archivedIds.has(thread.id)) return false
        if (folder === 'Trash' && !trashedIds.has(thread.id)) return false
        if (folder !== 'Archive' && folder !== 'Trash' && trashedIds.has(thread.id)) return false
        if (folder !== 'Archive' && folder !== 'All' && archivedIds.has(thread.id)) return false
        if ((unreadOnly || folder === 'Unread') && !thread.unread) return false
        if (folder === 'Starred' && !starredIds.has(thread.id)) return false
        const q = search.trim().toLowerCase()
        if (!q) return true
        return [thread.from, thread.subject, thread.preview].some(value => value.toLowerCase().includes(q))
      }),
    [threads, search, unreadOnly, folder, starredIds, archivedIds, trashedIds],
  )
  const missingCreds = emailsData?.error === 'missing_credentials'
  const agentmailConnectedEmpty =
    !missingCreds &&
    emailsData?.source === 'agentmail' &&
    threads.length === 0 &&
    (folder === 'INBOX' || folder === 'All')
  const error = emailsError
    ? emailsError instanceof Error
      ? emailsError.message
      : 'Failed to fetch'
    : emailsData?.error && emailsData.error !== 'missing_credentials'
      ? emailsData.error
      : null

  const invalidateAccounts = () => queryClient.invalidateQueries({ queryKey: queryKeys.emailAccounts })
  const invalidateEmails = useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.emails(folder, effectiveSelectedAccountId ?? undefined) }),
    [queryClient, folder, effectiveSelectedAccountId],
  )

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
      if (data.error) {
        setFormError(data.error)
        return
      }
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
      if (editingAccount?.id === id) {
        setEditingAccount(null)
        setForm(EMPTY_FORM)
      }
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
  const folderCounts: Partial<Record<Folder, number>> = {
    INBOX: threads.length,
    All: threads.length,
    Unread: unreadCount,
    Starred: starredIds.size,
    Archive: archivedIds.size,
    Drafts: drafts.length,
    Trash: trashedIds.size,
  }
  const selectedThread = visibleThreads.find(thread => thread.id === selectedThreadId) ?? visibleThreads[0] ?? null
  const selectedThreadAccount = accounts.find(
    account =>
      account.id === (selectedThread?.account_id ?? effectiveSelectedAccountId) ||
      account.agentmail_inbox_id === selectedThread?.account_id,
  )

  useEffect(() => {
    if (visibleThreads.length === 0) {
      if (selectedThreadId !== null) setSelectedThreadId(null)
      return
    }
    if (!selectedThreadId || !visibleThreads.some(thread => thread.id === selectedThreadId)) {
      setSelectedThreadId(visibleThreads[0].id)
    }
  }, [selectedThreadId, visibleThreads])

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

        setDrafts(current => {
          const withoutExisting = current.filter(draft => draft.id !== response.draft?.id)
          return [response.draft as DraftItem, ...withoutExisting]
        })
      } catch (error) {
        console.error('handlePrepareDraft failed:', error)
      }
    })()
  }, [selectedThread, selectedThreadAccount])

  const toggleStar = useCallback((threadId: string) => {
    setStarredIds(current => {
      const next = new Set(current)
      if (next.has(threadId)) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }, [])

  const archiveSelectedThread = useCallback(() => {
    if (!selectedThread) return
    setArchivedIds(current => new Set(current).add(selectedThread.id))
    setTrashedIds(current => {
      const next = new Set(current)
      next.delete(selectedThread.id)
      return next
    })
  }, [selectedThread])

  const trashSelectedThread = useCallback(() => {
    if (!selectedThread) return
    setTrashedIds(current => new Set(current).add(selectedThread.id))
    setArchivedIds(current => {
      const next = new Set(current)
      next.delete(selectedThread.id)
      return next
    })
  }, [selectedThread])

  const openComposer = useCallback((initial: Partial<ComposeState> = {}) => {
    setCompose({ ...EMPTY_COMPOSE, ...initial })
    setSendError(null)
    setComposeOpen(true)
  }, [])

  const openReplyComposer = useCallback(() => {
    if (!selectedThread) return
    openComposer({
      to: selectedThread.from,
      subject: selectedThread.subject.startsWith('Re:') ? selectedThread.subject : `Re: ${selectedThread.subject}`,
      body: `\n\nOn ${selectedThread.timestamp ? new Date(selectedThread.timestamp).toLocaleString() : 'this thread'}, ${selectedThread.from} wrote:\n${selectedThread.preview}`,
    })
  }, [openComposer, selectedThread])

  const openForwardComposer = useCallback(() => {
    if (!selectedThread) return
    openComposer({
      subject: selectedThread.subject.startsWith('Fwd:') ? selectedThread.subject : `Fwd: ${selectedThread.subject}`,
      body: `\n\nForwarded message\nFrom: ${selectedThread.from}\nDate: ${selectedThread.timestamp ? new Date(selectedThread.timestamp).toLocaleString() : 'Unknown'}\nSubject: ${selectedThread.subject}\n\n${selectedThread.preview}`,
    })
  }, [openComposer, selectedThread])

  const handleSendEmail = useCallback(() => {
    if (!effectiveSelectedAccountId) {
      setSendError('Select an account before sending.')
      return
    }

    void (async () => {
      setSending(true)
      setSendError(null)
      try {
        const response = await api.post<SendEmailResponse>('/api/email/send', {
          account_id: effectiveSelectedAccountId,
          ...compose,
        })
        if (response.error) {
          setSendError(response.error)
          return
        }
        setCompose(EMPTY_COMPOSE)
        setComposeOpen(false)
        refetchEmails()
      } catch (error) {
        setSendError(error instanceof Error ? error.message : 'Failed to send')
      } finally {
        setSending(false)
      }
    })()
  }, [compose, effectiveSelectedAccountId, refetchEmails])

  const selectedAccount = accounts.find(account => account.id === effectiveSelectedAccountId) ?? defaultAccount

  const handleCopyAgentMailAddress = useCallback(() => {
    const address = selectedAccount?.agentmail_inbox_id || selectedAccount?.address
    if (!address) return
    void navigator.clipboard?.writeText(address)
    setSetupNotice('Forwarding address copied.')
  }, [selectedAccount])

  const handleSendAgentMailTest = useCallback(() => {
    if (!selectedAccount) {
      setSetupNotice('No account selected.')
      return
    }
    const to = selectedAccount.agentmail_inbox_id || selectedAccount.address
    void (async () => {
      setSetupNotice('Sending test message...')
      try {
        const response = await api.post<SendEmailResponse>('/api/email/send', {
          account_id: selectedAccount.id,
          to,
          subject: 'ClawControl mail test',
          body: `This message verifies that ${to} can receive mail in ClawControl.`,
        })
        if (response.error) {
          setSetupNotice(response.error)
          return
        }
        setSetupNotice('Test sent. Refreshing inbox...')
        await refetchEmails()
      } catch (error) {
        setSetupNotice(error instanceof Error ? error.message : 'Failed to send test message')
      }
    })()
  }, [refetchEmails, selectedAccount])

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
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
            Email
          </h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <WarningCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Email not configured
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Link a mail account via <strong>Manage Accounts</strong> using its provider, address, and mapped AgentMail
            inbox ID.
          </p>
          <button
            onClick={() => {
              setManageOpen(true)
              openAddForm()
            }}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'var(--accent)',
              color: 'var(--text-on-color)',
              border: 'none',
              cursor: 'pointer',
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
    <div style={mailPageStyle}>
      <div style={mailTopbarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Envelope size={20} style={{ color: 'var(--accent)' }} />
          <PageHeader defaultTitle="Email" />
          {!loading && unreadCount > 0 && <span className="badge badge-green">{unreadCount} unread</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AccountSwitcher accounts={accounts} selectedAccountId={effectiveSelectedAccountId} onSelectAccount={selectAccount} />
          <button onClick={() => openComposer()} style={topButtonStyle}>
            <PencilSimple size={13} />
            Compose
          </button>
          <button
            onClick={() => {
              setManageOpen(true)
              if (!editingAccount) openAddForm()
            }}
            style={topButtonStyle}
          >
            <Gear size={13} />
            Accounts
          </button>
          <button onClick={() => refetchEmails()} style={topButtonStyle}>
            <ArrowsClockwise size={13} />
            Refresh
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '238px minmax(520px, 0.95fr) minmax(520px, 1.2fr)',
          gap: 0,
          alignItems: 'stretch',
          minHeight: 'calc(100vh - 150px)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          overflow: 'hidden',
          background: 'var(--bg-panel)',
        }}
      >
        <aside style={mailSidebarStyle}>
          <button onClick={() => openComposer()} style={composeButtonStyle}>
            <PencilSimple size={16} />
            New message
          </button>

          <div style={navSectionStyle}>
            <div style={sectionLabelStyle}>Mailboxes</div>
            {FOLDERS.filter(f => f.section === 'mailbox').map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setFolder(f.id)
                  setSelectedThreadId(null)
                }}
                style={folder === f.id ? activeFolderButtonStyle : folderButtonStyle}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {f.id === 'INBOX' && <Envelope size={14} />}
                  {f.id === 'All' && <Archive size={14} />}
                  {f.id === 'Unread' && <Clock size={14} />}
                  {f.id === 'Starred' && <Star size={14} />}
                  {f.label}
                </span>
                {!!folderCounts[f.id] && <span>{folderCounts[f.id]}</span>}
              </button>
            ))}
          </div>

          <div style={navSectionStyle}>
            <div style={sectionLabelStyle}>Folders</div>
            {FOLDERS.filter(f => f.section === 'system').map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setFolder(f.id)
                  setSelectedThreadId(null)
                }}
                style={folder === f.id ? activeFolderButtonStyle : folderButtonStyle}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {f.id === 'Trash' ? <Trash size={14} /> : <Archive size={14} />}
                  {f.label}
                </span>
                {!!folderCounts[f.id] && <span>{folderCounts[f.id]}</span>}
              </button>
            ))}
          </div>

          <div style={navSectionStyle}>
            <div style={sectionLabelStyle}>Accounts</div>
            {accounts.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>No accounts linked.</div>
            ) : (
              accounts.map(account => (
                <button
                  key={account.id}
                  onClick={() => {
                    selectAccount(account.id)
                    setSelectedThreadId(null)
                  }}
                  style={{
                    ...accountButtonStyle,
                    borderColor: account.id === effectiveSelectedAccountId ? 'var(--accent)' : 'var(--border)',
                    background: account.id === effectiveSelectedAccountId ? 'var(--purple-a08)' : 'var(--bg-elevated)',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.label}</span>
                  <small style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {account.address}
                  </small>
                </button>
              ))
            )}
          </div>
        </aside>

        <section style={{ minWidth: 0 }}>
          <div style={listHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 850, color: 'var(--text-primary)' }}>
                  {FOLDERS.find(f => f.id === folder)?.label ?? 'Inbox'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {visibleThreads.length} of {threads.length} messages
                </div>
              </div>
              <button
                onClick={() => setUnreadOnly(value => !value)}
                style={{
                  ...filterButtonStyle,
                  borderColor: unreadOnly ? 'var(--accent)' : 'var(--border)',
                  color: unreadOnly ? 'var(--text-on-color)' : 'var(--text-secondary)',
                  background: unreadOnly ? 'var(--accent)' : 'var(--bg-elevated)',
                }}
              >
                Unread
              </button>
            </div>
            <label style={searchBoxStyle}>
              <MagnifyingGlass size={14} style={{ color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search mail"
                aria-label="Search mail"
                style={searchInputStyle}
              />
            </label>
          </div>

          {loading && <SkeletonList count={5} lines={2} />}
          {error && <ErrorState resource="emails" onRetry={() => refetchEmails()} />}
          {!loading && !error && missingCreds && (
            <MailSourceState
              title="Mail source not connected"
              body="AgentMail returned no messages for this account, and IMAP credentials are missing. Connect Gmail, iCloud, Proton Bridge, or any IMAP mailbox to load your real inbox."
              onRetry={() => refetchEmails()}
            />
          )}
          {!loading && !error && agentmailConnectedEmpty && (
            <AgentMailEmptyList
              account={selectedAccount}
              onCopyAddress={handleCopyAgentMailAddress}
              onSendTest={handleSendAgentMailTest}
            />
          )}
          {!loading && !error && !missingCreds && !agentmailConnectedEmpty && (
            <EmailList
              threads={visibleThreads}
              selectedAccountId={effectiveSelectedAccountId}
              folder={folder}
              onInvalidateEmails={invalidateEmails}
              selectedThreadId={selectedThread?.id ?? null}
              onSelectThread={thread => setSelectedThreadId(thread.id)}
              starredIds={starredIds}
              onToggleStar={toggleStar}
              emptyTitle={search || unreadOnly || folder === 'Starred' ? 'No matching mail' : 'Inbox empty'}
              emptyDescription={
                search || unreadOnly || folder === 'Starred'
                  ? 'Clear filters to see the rest of this mailbox.'
                  : selectedAccount?.provider === 'agentmail'
                    ? 'AgentMail is connected, but this folder has no delivered messages yet.'
                    : 'No messages came back from this account yet.'
              }
            />
          )}
        </section>

        <section style={{ minWidth: 0 }}>
          {!loading && !error && missingCreds && (
            <MailSourceState
              title="No emails loaded"
              body="This is a configuration problem, not an empty inbox. The backend tried AgentMail first, then IMAP; IMAP has no host/user/password available."
              onRetry={() => refetchEmails()}
            />
          )}
          {!loading && !error && agentmailConnectedEmpty && (
            <AgentMailSetupPanel
              account={selectedAccount}
              notice={setupNotice}
              onCopyAddress={handleCopyAgentMailAddress}
              onSendTest={handleSendAgentMailTest}
              onCompose={() =>
                openComposer({
                  to: selectedAccount?.agentmail_inbox_id ?? '',
                  subject: 'ClawControl mail test',
                  body: 'Testing the ClawControl mail pipeline.',
                })
              }
            />
          )}
          {!loading && !error && !missingCreds && !agentmailConnectedEmpty && (
            <ThreadPanel
              thread={selectedThread}
              accountLabel={selectedThreadAccount?.label ?? null}
              onPrepareDraft={handlePrepareDraft}
              onComposeReply={openReplyComposer}
              onComposeForward={openForwardComposer}
              onArchive={archiveSelectedThread}
              onTrash={trashSelectedThread}
            />
          )}
          {!loading && !error && !missingCreds && folder === 'Drafts' && <DraftQueue drafts={drafts} />}
        </section>
      </div>

      <EmailComposer
        open={composeOpen}
        account={selectedThreadAccount ?? accounts.find(account => account.id === effectiveSelectedAccountId) ?? null}
        compose={compose}
        sending={sending}
        sendError={sendError}
        onChange={setCompose}
        onClose={() => setComposeOpen(false)}
        onSend={handleSendEmail}
      />

      {managePanelNode}
    </div>
  )
}

function AgentMailEmptyList({
  account,
  onCopyAddress,
  onSendTest,
}: {
  account: EmailAccount | null
  onCopyAddress: () => void
  onSendTest: () => void
}) {
  const forwardingAddress = account?.agentmail_inbox_id || account?.address || 'No AgentMail inbox mapped'

  return (
    <div style={agentmailEmptyListStyle}>
      <div style={connectedPillStyle}>Connected AgentMail inbox</div>
      <div style={{ fontSize: '18px', fontWeight: 850, color: 'var(--text-primary)' }}>Ready for forwarded mail</div>
      <p style={{ margin: '8px 0 18px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
        The API key works and the inbox exists. No messages have arrived in this AgentMail inbox yet.
      </p>
      <div style={forwardAddressBoxStyle}>{forwardingAddress}</div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '14px' }}>
        <button onClick={onCopyAddress} style={topButtonStyle}>
          Copy address
        </button>
        <button onClick={onSendTest} style={{ ...topButtonStyle, background: 'var(--accent)', color: 'var(--text-on-color)' }}>
          Send test
        </button>
      </div>
    </div>
  )
}

function AgentMailSetupPanel({
  account,
  notice,
  onCopyAddress,
  onSendTest,
  onCompose,
}: {
  account: EmailAccount | null
  notice: string | null
  onCopyAddress: () => void
  onSendTest: () => void
  onCompose: () => void
}) {
  const forwardingAddress = account?.agentmail_inbox_id || account?.address || ''

  return (
    <div style={agentmailSetupPanelStyle}>
      <div style={setupHeroStyle}>
        <div style={mailSourceIconStyle}>
          <Envelope size={24} />
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 850, textTransform: 'uppercase' }}>
          Inbox online
        </div>
        <h2 style={{ margin: '8px 0 8px', fontSize: '24px', color: 'var(--text-primary)' }}>
          Finish routing mail into Hermes
        </h2>
        <p style={{ margin: 0, maxWidth: '620px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.7 }}>
          AgentMail is connected, but this mailbox has never received a message. Forward your real mailbox here, or send a
          test message to prove the pipe end-to-end.
        </p>
      </div>

      <div style={setupGridStyle}>
        <div style={setupCardStyle}>
          <div style={setupStepStyle}>1</div>
          <h3 style={setupCardTitleStyle}>Forward into this inbox</h3>
          <div style={forwardAddressBoxStyle}>{forwardingAddress || 'No AgentMail inbox mapped'}</div>
          <button onClick={onCopyAddress} style={{ ...topButtonStyle, marginTop: '12px' }}>
            Copy forwarding address
          </button>
        </div>
        <div style={setupCardStyle}>
          <div style={setupStepStyle}>2</div>
          <h3 style={setupCardTitleStyle}>Validate delivery</h3>
          <p style={setupCardBodyStyle}>Send a test message to this AgentMail address, then refresh the inbox.</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={onSendTest} style={{ ...topButtonStyle, background: 'var(--accent)', color: 'var(--text-on-color)' }}>
              Send test
            </button>
            <button onClick={onCompose} style={topButtonStyle}>
              Open compose
            </button>
          </div>
          {notice && <div style={setupNoticeStyle}>{notice}</div>}
        </div>
        <div style={setupCardStyle}>
          <div style={setupStepStyle}>3</div>
          <h3 style={setupCardTitleStyle}>Bring the full inbox</h3>
          <p style={setupCardBodyStyle}>
            For Gmail/iCloud/Proton-style full history, this app still needs IMAP credentials or a provider sync worker.
            Current AgentMail only receives newly forwarded mail.
          </p>
        </div>
      </div>
    </div>
  )
}

function MailSourceState({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div style={mailSourceStateStyle}>
      <div style={mailSourceIconStyle}>
        <WarningCircle size={24} />
      </div>
      <div style={{ fontSize: '16px', fontWeight: 850, color: 'var(--text-primary)' }}>{title}</div>
      <p style={{ maxWidth: '480px', margin: '8px auto 18px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
        {body}
      </p>
      <button onClick={onRetry} style={topButtonStyle}>
        <ArrowsClockwise size={13} />
        Retry
      </button>
    </div>
  )
}

const mailPageStyle: CSSProperties = {
  width: '100%',
  maxWidth: 'none',
  minHeight: 'calc(100vh - 96px)',
  display: 'flex',
  flexDirection: 'column',
}

const mailTopbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '14px',
}

const topButtonStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text-secondary)',
  padding: '7px 10px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  fontWeight: 700,
}

const mailSidebarStyle: CSSProperties = {
  borderRight: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  overflow: 'hidden',
  minHeight: 'calc(100vh - 150px)',
  padding: '16px 12px',
}

const composeButtonStyle: CSSProperties = {
  width: '100%',
  border: 'none',
  borderRadius: '999px',
  background: 'var(--accent)',
  color: 'var(--text-on-color)',
  padding: '12px 14px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  fontSize: '13px',
  fontWeight: 850,
  cursor: 'pointer',
  marginBottom: '18px',
}

const navSectionStyle: CSSProperties = {
  paddingTop: '10px',
  marginTop: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const sectionLabelStyle: CSSProperties = {
  fontSize: '10px',
  fontWeight: 850,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  marginBottom: '5px',
}

const folderButtonStyle: CSSProperties = {
  padding: '9px 11px',
  borderRadius: '999px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s',
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: 'none',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
}

const activeFolderButtonStyle: CSSProperties = {
  ...folderButtonStyle,
  background: 'var(--accent)',
  color: 'var(--text-on-color)',
}

const accountButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '10px 11px',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'grid',
  gap: '3px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: 750,
}

const listHeaderStyle: CSSProperties = {
  background: 'var(--bg-panel)',
  borderBottom: '1px solid var(--border)',
  padding: '14px',
  display: 'grid',
  gap: '10px',
}

const searchBoxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  color: 'var(--text-primary)',
  padding: '0 10px',
}

const searchInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  padding: '9px 0',
  fontSize: '13px',
  outline: 'none',
}

const filterButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '12px',
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const mailSourceStateStyle: CSSProperties = {
  minHeight: 'calc(100vh - 250px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '40px 28px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-panel)',
}

const mailSourceIconStyle: CSSProperties = {
  width: '54px',
  height: '54px',
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--amber-warm)',
  background: 'var(--warning-a08)',
  border: '1px solid var(--warning-a25)',
  marginBottom: '14px',
}

const agentmailEmptyListStyle: CSSProperties = {
  minHeight: 'calc(100vh - 250px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '42px 28px',
  background: 'var(--bg-panel)',
  borderTop: '1px solid var(--border)',
}

const connectedPillStyle: CSSProperties = {
  borderRadius: '999px',
  border: '1px solid var(--success-a25, rgba(34,197,94,0.28))',
  background: 'var(--success-a08, rgba(34,197,94,0.08))',
  color: 'var(--green, #22c55e)',
  padding: '4px 10px',
  fontSize: '11px',
  fontWeight: 850,
  marginBottom: '12px',
}

const forwardAddressBoxStyle: CSSProperties = {
  width: '100%',
  maxWidth: '520px',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  padding: '11px 12px',
  fontSize: '12px',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const agentmailSetupPanelStyle: CSSProperties = {
  minHeight: 'calc(100vh - 150px)',
  borderLeft: '1px solid var(--border)',
  background: 'var(--bg-panel)',
  padding: '42px',
  display: 'flex',
  flexDirection: 'column',
  gap: '28px',
}

const setupHeroStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
}

const setupGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '14px',
  alignItems: 'stretch',
}

const setupCardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '12px',
  background: 'var(--bg-elevated)',
  padding: '18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  minHeight: '190px',
}

const setupStepStyle: CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  background: 'var(--accent)',
  color: 'var(--text-on-color)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: 900,
}

const setupCardTitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontWeight: 850,
}

const setupCardBodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
  fontSize: '12px',
  lineHeight: 1.6,
}

const setupNoticeStyle: CSSProperties = {
  marginTop: 'auto',
  borderTop: '1px solid var(--border)',
  paddingTop: '10px',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  lineHeight: 1.5,
}
