export interface Email {
  id: string
  from: string
  subject: string
  date: string
  preview: string
  read: boolean
  folder: string
}

export interface MailThread {
  id: string
  account_id: string | null
  subject: string
  from: string
  preview: string
  unread: boolean
  timestamp?: string | null
  message_count?: number | null
}

export interface ComposeState {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
}

export interface SendEmailResponse {
  sent?: {
    message_id: string
    thread_id: string
  }
  error?: string
}

export interface DraftItem {
  id: string
  account_label: string
  subject: string
  body: string
  handoff_status: 'needs_human_send'
}

export interface EmailAccount {
  id: string
  label: string
  provider: string
  address: string
  agentmail_inbox_id: string
  forwarding_status: 'active' | 'pending' | 'error'
  is_default: boolean
  imap_host: string
  imap_port: number
  imap_username: string
  imap_configured: boolean
}

export interface AccountForm {
  label: string
  provider: string
  address: string
  agentmail_inbox_id: string
  forwarding_status: 'active' | 'pending' | 'error'
  is_default: boolean
  imap_host: string
  imap_port: string
  imap_username: string
  imap_password: string
}

export type Folder = 'INBOX' | 'All' | 'Unread' | 'Starred' | 'Archive' | 'Sent' | 'Drafts' | 'Spam' | 'Trash'

export const FOLDERS: { id: Folder; label: string; section: 'mailbox' | 'system' }[] = [
  { id: 'INBOX', label: 'Inbox', section: 'mailbox' },
  { id: 'All', label: 'All mail', section: 'mailbox' },
  { id: 'Unread', label: 'Unread', section: 'mailbox' },
  { id: 'Starred', label: 'Starred', section: 'mailbox' },
  { id: 'Archive', label: 'Archive', section: 'system' },
  { id: 'Sent', label: 'Sent', section: 'system' },
  { id: 'Drafts', label: 'Drafts', section: 'system' },
  { id: 'Spam', label: 'Spam', section: 'system' },
  { id: 'Trash', label: 'Trash', section: 'system' },
]

export const EMPTY_FORM: AccountForm = {
  label: '',
  provider: 'proton',
  address: '',
  agentmail_inbox_id: '',
  forwarding_status: 'pending',
  is_default: false,
  imap_host: '127.0.0.1',
  imap_port: '1143',
  imap_username: '',
  imap_password: '',
}

export function providerNeedsAgentMailAccess(provider: string): boolean {
  void provider
  return false
}

export function providerImapDefaults(provider: string): Pick<AccountForm, 'imap_host' | 'imap_port'> {
  switch (provider.trim().toLowerCase()) {
    case 'proton':
    case 'protonmail':
      return { imap_host: '127.0.0.1', imap_port: '1143' }
    case 'gmail':
    case 'google':
    case 'google-workspace':
      return { imap_host: 'imap.gmail.com', imap_port: '993' }
    case 'outlook':
    case 'hotmail':
    case 'office365':
    case 'exchange':
      return { imap_host: 'outlook.office365.com', imap_port: '993' }
    case 'icloud':
    case 'apple':
      return { imap_host: 'imap.mail.me.com', imap_port: '993' }
    case 'fastmail':
      return { imap_host: 'imap.fastmail.com', imap_port: '993' }
    default:
      return { imap_host: '', imap_port: '993' }
  }
}

export function formatDate(iso: string): string {
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
