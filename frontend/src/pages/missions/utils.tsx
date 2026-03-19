import { CheckCircle, Clock, Lightning, Eye, XCircle, FileText, Terminal, PencilSimple, Lightbulb, DotOutline, MagnifyingGlass, User } from '@phosphor-icons/react'

/* ─── Status helpers ────────────────────────────────────────────────────── */

export function statusColor(status: string): string {
  switch (status) {
    case 'done': return 'var(--green-400)'
    case 'active': return 'var(--accent-bright)'
    case 'awaiting_review': return 'var(--amber)'
    case 'failed': return 'var(--red-500)'
    case 'pending': return 'var(--text-muted)'
    default: return 'var(--text-muted)'
  }
}

export function statusIcon(status: string) {
  switch (status) {
    case 'done': return <CheckCircle size={14} color="var(--green-400)" />
    case 'active': return <Lightning size={14} color="var(--accent-bright)" />
    case 'awaiting_review': return <Eye size={14} color="var(--amber)" />
    case 'failed': return <XCircle size={14} color="var(--red-500)" />
    case 'pending': return <Clock size={14} color="var(--text-muted)" />
    default: return <Clock size={14} color="var(--text-muted)" />
  }
}

/* ─── Event metadata ────────────────────────────────────────────────────── */

export const EVENT_META: Record<string, { tickColor: string; icon: React.ReactNode; label: string; labelColor: string; bg: string; border: string }> = {
  user:   { tickColor: 'var(--pink)', icon: <User size={11} />,      label: 'User',   labelColor: 'var(--pink)', bg: 'var(--red-a12)',  border: 'var(--red-a30)' },
  think:  { tickColor: 'var(--purple)', icon: <Lightbulb size={11} />, label: 'Think',  labelColor: 'var(--accent-bright)', bg: 'var(--purple-a12)', border: 'var(--border-accent)' },
  write:  { tickColor: 'var(--green-500)', icon: <FileText size={11} />,  label: 'Write',  labelColor: 'var(--green-400)', bg: 'var(--green-400-a15)',   border: 'var(--green-400-a30)' },
  edit:   { tickColor: 'var(--green)', icon: <PencilSimple size={11} />,    label: 'Edit',   labelColor: 'var(--green)', bg: 'var(--green-a15)',  border: 'var(--green-a15)' },
  bash:   { tickColor: 'var(--blue)', icon: <Terminal size={11} />,  label: 'Bash',   labelColor: 'var(--blue)', bg: 'var(--blue-a25)',  border: 'var(--blue-a25)' },
  read:   { tickColor: 'var(--cyan)', icon: <Eye size={11} />,       label: 'Read',   labelColor: 'var(--cyan)', bg: 'var(--green-a12)',   border: 'var(--green-a15)' },
  glob:   { tickColor: 'var(--orange)', icon: <MagnifyingGlass size={11} />,    label: 'Glob',   labelColor: 'var(--orange)', bg: 'var(--warning-a12)',  border: 'var(--warning-a30)' },
  grep:   { tickColor: 'var(--orange)', icon: <MagnifyingGlass size={11} />,    label: 'Grep',   labelColor: 'var(--orange)', bg: 'var(--warning-a12)',  border: 'var(--warning-a30)' },
  result: { tickColor: 'var(--amber)', icon: <DotOutline size={11} />, label: 'Result', labelColor: 'var(--warning)', bg: 'var(--warning-a15)',  border: 'var(--warning-a30)' },
}

/* ─── Formatting ────────────────────────────────────────────────────────── */

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `+${m}:${s.toString().padStart(2, '0')}`
}

/* intentionally hardcoded — dynamic rgba generator for timeline colors */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}
