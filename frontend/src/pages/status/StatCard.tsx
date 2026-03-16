export function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg-white-03)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '28px',
        fontWeight: 700,
        fontFamily: 'monospace',
        color: accent ?? 'var(--text-primary)',
        lineHeight: 1.2,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--text-muted)',
        marginTop: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
    </div>
  )
}
