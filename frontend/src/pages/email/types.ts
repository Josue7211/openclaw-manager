export interface Email {
  id: string
  from: string
  subject: string
  date: string
  preview: string
  read: boolean
  folder: string
}

export interface EmailAccount {
  id: string
  label: string
  host: string
  port: number
  username: string
  tls: boolean
  is_default: boolean
  created_at: string
}

export interface AccountForm {
  label: string
  host: string
  port: string
  username: string
  password: string
  tls: boolean
  is_default: boolean
}

export type Folder = 'INBOX' | 'Sent'

export const FOLDERS: { id: Folder; label: string }[] = [
  { id: 'INBOX', label: 'Inbox' },
  { id: 'Sent', label: 'Sent' },
]

export const EMPTY_FORM: AccountForm = {
  label: '', host: '', port: '993', username: '', password: '', tls: true, is_default: false,
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
