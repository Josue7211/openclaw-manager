export const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px',
  backdropFilter: 'blur(12px)',
}

export const sectionTitle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '16px',
}

export const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: '13px',
  color: 'var(--text-primary)',
}

export const rowLast: React.CSSProperties = { ...row, borderBottom: 'none' }

export const val: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'monospace',
  fontSize: '12px',
}

export const dotStyle = (online: boolean): React.CSSProperties => ({
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: online ? 'var(--green-500)' : 'var(--red-500)',
  boxShadow: online ? '0 0 6px var(--green-400-a30)' : '0 0 6px var(--red-500-a25)',
  flexShrink: 0,
})
