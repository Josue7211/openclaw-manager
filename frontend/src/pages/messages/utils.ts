import React from 'react'
import type { Conversation, Message } from './types'

/* ─── Constants ─────────────────────────────────────────────────────────── */

export const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

/* ─── Utilities ─────────────────────────────────────────────────────────── */

export function timeAgo(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const now = Date.now()
  const diff = (now - d.getTime()) / 1000
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  const thisYear = new Date().getFullYear()
  if (d.getFullYear() !== thisYear) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) {
    return `Today ${formatTime(ts)}`
  } else if (diffDays === 1) {
    return `Yesterday ${formatTime(ts)}`
  } else if (diffDays < 7) {
    return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${formatTime(ts)}`
  }
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return `${d.toLocaleDateString('en-US', opts)} ${formatTime(ts)}`
}

export function isIMessage(conv: Conversation): boolean {
  const svc = conv.service?.toLowerCase() || ''
  const guidLower = conv.guid?.toLowerCase() || ''
  if (svc.includes('imessage') || guidLower.startsWith('imessage')) return true
  // macOS 26+ uses 'any' as the unified service — treat as iMessage unless clearly SMS
  if (svc === 'any' || guidLower.startsWith('any;')) {
    // If participants have explicit SMS service, it's SMS; otherwise treat as iMessage
    const hasExplicitSms = conv.participants?.some(p => p.service?.toLowerCase() === 'sms')
    if (!hasExplicitSms) return true
  }
  // Group chats where all participants have iMessage or 'any' service
  if (conv.participants?.length > 1 &&
    conv.participants.every(p => {
      const ps = p.service?.toLowerCase() || ''
      return ps.includes('imessage') || ps === 'any'
    })) return true
  return false
}

export function shouldShowTimestamp(messages: Message[], idx: number): boolean {
  if (idx === 0) return true
  const prev = messages[idx - 1]
  const curr = messages[idx]
  return (curr.dateCreated - prev.dateCreated) > 3600000
}

export function resolveSenderName(handle: { address: string } | undefined, contactLookup: Record<string, string>): string {
  if (!handle) return 'Unknown'
  const addr = handle.address
  const digits = addr.replace(/\D/g, '')
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return contactLookup[normalized] || contactLookup[addr.toLowerCase()] || addr
}

export function isGroupChat(conv: Conversation): boolean {
  return (conv.participants?.length ?? 0) > 1
}

export function renderTextWithLinks(text: string, fromMe: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  URL_RE.lastIndex = 0

  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const url = match[0].replace(/[.,;:!?)]+$/, '')
    const trailing = match[0].slice(url.length)
    parts.push(
      React.createElement('a', {
        key: match.index,
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        style: {
          color: fromMe ? 'var(--bg-white-95)' : 'var(--apple-blue)',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted' as const,
          textUnderlineOffset: '2px',
        },
      }, url)
    )
    if (trailing) parts.push(trailing)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  URL_RE.lastIndex = 0
  return parts.length > 0 ? parts : [text]
}

/** Wrap matching substrings in <mark> for in-conversation search highlighting */
export function highlightSearchText(
  nodes: React.ReactNode[],
  query: string,
  isActiveMatch: boolean,
): React.ReactNode[] {
  if (!query) return nodes
  const q = query.toLowerCase()
  let keyCounter = 0
  return nodes.map(node => {
    if (typeof node !== 'string') return node
    const parts: React.ReactNode[] = []
    let remaining = node
    let lower = remaining.toLowerCase()
    let idx = lower.indexOf(q)
    while (idx !== -1) {
      if (idx > 0) parts.push(remaining.slice(0, idx))
      parts.push(
        React.createElement('mark', {
          key: `hl-${keyCounter++}`,
          style: {
            background: isActiveMatch ? 'var(--yellow-bright-a35)' : 'var(--yellow-bright-a12)',
            color: 'inherit',
            borderRadius: '2px',
            padding: '0 1px',
          },
        }, remaining.slice(idx, idx + query.length))
      )
      remaining = remaining.slice(idx + query.length)
      lower = remaining.toLowerCase()
      idx = lower.indexOf(q)
    }
    if (remaining) parts.push(remaining)
    return parts.length > 0 ? parts : node
  }).flat()
}

export function extractFirstUrl(text: string): string | null {
  URL_RE.lastIndex = 0
  const match = URL_RE.exec(text)
  URL_RE.lastIndex = 0
  return match ? match[0].replace(/[.,;:!?)]+$/, '') : null
}
