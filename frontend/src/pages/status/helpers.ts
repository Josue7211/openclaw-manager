export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function statusColor(status: string): string {
  switch (status) {
    case 'ok':
      return 'var(--green-500)'
    case 'error':
    case 'degraded':
      return 'var(--yellow)'
    case 'unreachable':
      return 'var(--red-500)'
    case 'not_configured':
      return 'var(--text-muted)'
    default:
      return 'var(--text-muted)'
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'ok':
      return 'Connected'
    case 'error':
      return 'Error'
    case 'unreachable':
      return 'Unreachable'
    case 'not_configured':
      return 'Not Configured'
    default:
      return status
  }
}
