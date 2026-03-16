export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

export function cpuColor(cpu: number): string {
  if (cpu > 0.7) return 'var(--red)'
  if (cpu > 0.5) return 'var(--gold)'
  return 'var(--green)'
}
