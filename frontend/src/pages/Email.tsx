


import { useEffect, useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, RefreshCw, AlertCircle, ChevronDown, ChevronUp, Settings, Star } from 'lucide-react'
import { SkeletonList } from '@/components/Skeleton'

import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { ManagePanel } from './email/ManagePanel'

interface Email {
  id: string
  from: string
  subject: string
  date: string
  preview: string
  read: boolean
  folder: string
}

interface EmailAccount {
  id: string
  label: string
  host: string
  port: number
  username: string
  tls: boolean
  is_default: boolean
  created_at: string
}

interface AccountForm {
  label: string
  host: string
  port: string
  username: string
  password: string
  tls: boolean
  is_default: boolean
}

type Folder = 'INBOX' | 'Sent'

const FOLDERS: { id: Folder; label: string }[] = [
  { id: 'INBOX', label: 'Inbox' },
  { id: 'Sent', label: 'Sent' },
]

const EMPTY_FORM: AccountForm = {
  label: '', host: '', port: '993', username: '', password: '', tls: true, is_default: false,
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EmailPage() {
  const queryClient = useQueryClient()

  const [folder, setFolder] = useState<Folder>('INBOX')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [markingRead, setMarkingRead] = useState<Set<string>>(new Set())

  // Multi-account state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null)
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
  const invalidateEmails = () => queryClient.invalidateQueries({ queryKey: ['emails'] })

  const selectAccount = useCallback((id: string) => {
    setSelectedAccountId(id)
    if (typeof window !== 'undefined') localStorage.setItem('email_account_id', id)
    setAccountDropdownOpen(false)
    setExpanded(null)
  }, [])

  const handleMarkRead = useCallback(async (email: Email) => {
    if (email.read || markingRead.has(email.id)) return
    setMarkingRead(prev => new Set(prev).add(email.id))
    try {
      await api.patch('/api/email', { id: email.id, read: true, account_id: selectedAccountId })
      invalidateEmails()
    } catch {
      // silently ignore
    } finally {
      setMarkingRead(prev => { const s = new Set(prev); s.delete(email.id); return s })
    }
  }, [markingRead, selectedAccountId])

  const toggleExpand = useCallback((email: Email) => {
    setExpanded(prev => prev === email.id ? null : email.id)
    handleMarkRead(email)
  }, [handleMarkRead])

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

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
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

  if (missingCreds && accounts.length === 0) {
    return (
      <div style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <Mail size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>Email</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <AlertCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
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
        {manageOpen && (
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
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Mail size={20} style={{ color: 'var(--accent)' }} />
          <PageHeader defaultTitle="Email" />
          {!loading && unreadCount > 0 && (
            <span className="badge badge-green" style={{ marginLeft: '4px' }}>
              {unreadCount} unread
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Account switcher */}
          {accounts.length > 0 && (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setAccountDropdownOpen(o => !o)}
                style={{
                  background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
                  color: 'var(--text-primary)', padding: '6px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500,
                }}
              >
                <Mail size={12} style={{ color: 'var(--accent)' }} />
                {selectedAccount?.label ?? 'Select account'}
                <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
              </button>
              {accountDropdownOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px',
                  minWidth: '180px', zIndex: 50, boxShadow: '0 4px 16px var(--overlay-light)',
                  overflow: 'hidden',
                }}>
                  {accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => selectAccount(acc.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        width: '100%', padding: '9px 12px', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        background: acc.id === selectedAccountId ? 'var(--purple-a10)' : 'none',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{acc.label}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{acc.username}</div>
                      </div>
                      {acc.is_default && <Star size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manage Accounts */}
          <button
            onClick={() => { setManageOpen(true); if (!editingAccount) openAddForm() }}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-secondary)', padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
            }}
          >
            <Settings size={12} />
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
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Folder tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {FOLDERS.map(f => (
          <button
            key={f.id}
            onClick={() => { setFolder(f.id); setExpanded(null) }}
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
          <AlertCircle size={14} style={{ color: 'var(--amber-warm)', flexShrink: 0 }} />
          No credentials for this account. Select a different account or add credentials via Manage Accounts.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <SkeletonList count={3} lines={2} />
      )}

      {/* Email list */}
      {!loading && !error && !missingCreds && (
        <>
          {emails.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
              No emails in {folder === 'INBOX' ? 'Inbox' : 'Sent'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {emails.map(email => {
                const isExpanded = expanded === email.id
                return (
                  <div
                    key={email.id}
                    style={{
                      borderRadius: '8px',
                      border: email.read ? '1px solid var(--border)' : '1px solid var(--purple-a30)',
                      background: email.read ? 'var(--bg-panel)' : 'var(--purple-a08)',
                      transition: 'all 0.15s',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => toggleExpand(email)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        width: '100%', padding: '12px 14px',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                        background: email.read ? 'transparent' : 'var(--accent)',
                      }} />
                      <div style={{
                        width: '160px', flexShrink: 0, fontSize: '13px',
                        fontWeight: email.read ? 400 : 600,
                        color: email.read ? 'var(--text-secondary)' : 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {email.from}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                        <span style={{
                          fontSize: '13px', fontWeight: email.read ? 400 : 600,
                          color: 'var(--text-primary)', flexShrink: 0, maxWidth: '240px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {email.subject}
                        </span>
                        {email.preview && (
                          <span style={{
                            fontSize: '12px', color: 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            — {email.preview}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'monospace', marginLeft: '8px' }}>
                        {formatDate(email.date)}
                      </div>
                      <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div style={{ padding: '0 14px 14px 32px', borderTop: '1px solid var(--border)' }}>
                        <div style={{
                          marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)',
                          lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {email.preview || '(no preview available)'}
                        </div>
                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {new Date(email.date).toLocaleString()}
                          </span>
                          {!email.read && (
                            <button
                              onClick={() => handleMarkRead(email)}
                              disabled={markingRead.has(email.id)}
                              style={{
                                padding: '3px 10px', borderRadius: '6px', fontSize: '11px',
                                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                color: 'var(--text-secondary)', cursor: 'pointer',
                              }}
                            >
                              Mark as read
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Manage accounts panel */}
      {manageOpen && (
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
      )}
    </div>
  )
}
