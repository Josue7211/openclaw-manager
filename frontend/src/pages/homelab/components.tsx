import { cpuColor, formatBytes } from './helpers'

// ── Shared styles ────────────────────────────────────────────────────────────

export const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '20px',
}

export const label: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: '4px',
}

export const sectionTitle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: '12px',
}

// ── Components ───────────────────────────────────────────────────────────────

export function CpuBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = cpuColor(value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1,
        height: '6px',
        background: 'var(--bg-elevated)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '11px', color, fontFamily: 'monospace', minWidth: '36px', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

export function MemBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const color = pct > 85 ? 'var(--red)' : pct > 65 ? 'var(--gold)' : 'var(--accent-blue)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1,
        height: '6px',
        background: 'var(--bg-elevated)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', minWidth: '80px', textAlign: 'right' }}>
        {formatBytes(used)} / {formatBytes(total)}
      </span>
    </div>
  )
}

export function StatusDot({ status }: { status: string }) {
  const online = status === 'online' || status === 'running'
  return (
    <span style={{
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: online ? 'var(--green)' : 'var(--red)',
      boxShadow: online ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
      flexShrink: 0,
    }} />
  )
}
