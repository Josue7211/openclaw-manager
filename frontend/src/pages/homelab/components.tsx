import type { ReactNode } from 'react'
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
      <div
        style={{
          flex: 1,
          height: '6px',
          background: 'var(--bg-elevated)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: '3px',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span style={{ fontSize: '11px', color, fontFamily: 'monospace', minWidth: '36px', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

export function MemBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const color = pct > 85 ? 'var(--red)' : pct > 65 ? 'var(--gold)' : 'var(--tertiary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          flex: 1,
          height: '6px',
          background: 'var(--bg-elevated)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: '3px',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          minWidth: '80px',
          textAlign: 'right',
        }}
      >
        {formatBytes(used)} / {formatBytes(total)}
      </span>
    </div>
  )
}

export function StatusDot({ status }: { status: string }) {
  const online = status === 'online' || status === 'running'
  return (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: online ? 'var(--secondary)' : 'var(--red)',
        boxShadow: online ? '0 0 6px var(--secondary)' : '0 0 6px var(--red)',
        flexShrink: 0,
      }}
    />
  )
}

export function RuntimeCard({ label: noteLabel, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' }) {
  return (
    <div
      style={{
        ...card,
        padding: '12px 14px',
        minHeight: '74px',
        borderColor: tone === 'ok' ? 'var(--secondary-a25)' : 'var(--gold-a25)',
        background: tone === 'ok' ? 'var(--secondary-a06)' : 'var(--gold-a08)',
      }}
    >
      <div style={label}>{noteLabel}</div>
      <div
        style={{
          marginTop: '8px',
          color: 'var(--text-primary)',
          fontSize: '12px',
          lineHeight: 1.35,
          fontFamily: 'monospace',
        }}
      >
        {value}
      </div>
    </div>
  )
}

export function InfoPanel({
  title,
  text,
  tone = 'info',
}: {
  title: string
  text: string
  tone?: 'info' | 'warn' | 'error' | 'ok'
}) {
  const colors = {
    info: ['var(--blue-a08)', 'var(--blue-a25)', 'var(--blue-solid)'],
    warn: ['var(--gold-a12)', 'var(--gold-a25)', 'var(--gold)'],
    error: ['var(--red-500-a12)', 'var(--red-500-a25)', 'var(--red-bright)'],
    ok: ['var(--secondary-a08)', 'var(--secondary-a25)', 'var(--secondary-bright)'],
  }[tone]
  return (
    <div
      style={{
        marginBottom: '18px',
        padding: '14px 18px',
        background: colors[0],
        border: `1px solid ${colors[1]}`,
        borderRadius: '10px',
      }}
    >
      <div style={{ fontWeight: 700, color: colors[2], fontSize: '13px', marginBottom: '4px' }}>{title}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.55 }}>{text}</div>
    </div>
  )
}

export function SummaryCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div style={card}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map(([rowLabel, value]) => (
          <div
            key={rowLabel}
            style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{rowLabel}</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <StatusDot status={meta === 'offline' ? 'offline' : 'online'} />
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>
        {meta}
      </span>
    </div>
  )
}

export function ResourceList({
  rows,
  empty,
}: {
  empty: string
  rows: Array<{ id: string; name: string; meta: string; status: string; actions: ReactNode }>
}) {
  if (!rows.length) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{empty}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rows.map(row => (
        <div
          key={row.id}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: '12px',
            alignItems: 'center',
            padding: '10px 12px',
            background: 'var(--bg-elevated)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <StatusDot status={row.status} />
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.name}
              </span>
            </div>
            <div
              style={{
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: '3px',
              }}
            >
              {row.meta}
            </div>
          </div>
          <div>{row.actions}</div>
        </div>
      ))}
    </div>
  )
}

export const smallButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  cursor: 'pointer',
}

export const drawerBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 40,
  display: 'flex',
  justifyContent: 'flex-end',
}

export const drawerStyle: React.CSSProperties = {
  width: 'min(720px, 92vw)',
  height: '100%',
  overflow: 'auto',
  background: 'var(--bg-card)',
  borderLeft: '1px solid var(--border)',
  padding: '20px',
}

export const editorTextareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '52vh',
  resize: 'vertical',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontFamily: 'monospace',
  fontSize: '12px',
  lineHeight: 1.5,
}

export const editorInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontSize: '12px',
}
