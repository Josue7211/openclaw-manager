// Shared utility functions — importable from both server and client components

export function timeAgo(input: string | number | null): string {
  if (input == null) return 'Never'
  const d = typeof input === 'number' ? new Date(input) : new Date(input)
  if (isNaN(d.getTime())) return 'Never'
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function formatDate(input: string | number | Date, style: 'short' | 'long' | 'relative' = 'long'): string {
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return '—'

  if (style === 'relative') {
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
    return d.toLocaleDateString('en-US', opts)
  }

  if (style === 'short') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  // 'long'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatTimeMs(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

/** Return today's date as an ISO string (YYYY-MM-DD). */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** Format a phone number or conversation identifier for display.
 *  Shared by Messages page and CommandPalette. */
export function formatContactLabel(conv: {
  displayName: string | null
  chatId: string
  participants: { address: string }[]
  guid: string
}): string {
  if (conv.displayName) return conv.displayName
  const id = conv.chatId || conv.participants?.[0]?.address || conv.guid
  if (id.startsWith('+1') && id.length === 12) {
    return `(${id.slice(2, 5)}) ${id.slice(5, 8)}-${id.slice(8)}`
  }
  if (id.startsWith('+') && id.length > 10) {
    const digits = id.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    return id
  }
  return id
}
