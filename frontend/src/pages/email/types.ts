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
}

export interface AccountForm {
  label: string
  provider: string
  address: string
  agentmail_inbox_id: string
  forwarding_status: 'active' | 'pending' | 'error'
  is_default: boolean
}

export type Folder = 'INBOX' | 'Sent'

export const FOLDERS: { id: Folder; label: string }[] = [
  { id: 'INBOX', label: 'Inbox' },
  { id: 'Sent', label: 'Sent' },
]

export const EMPTY_FORM: AccountForm = {
  label: '', provider: '', address: '', agentmail_inbox_id: '', forwarding_status: 'pending', is_default: false,
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
