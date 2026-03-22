import { useOpenClawUsage } from '@/hooks/useOpenClawUsage'

export default function UsageTab({ healthy }: { healthy: boolean }) {
  if (!healthy) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          OpenClaw is not configured.
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Set OPENCLAW_API_URL in Settings &gt; Connections to view usage data.
        </p>
      </div>
    )
  }

  return <UsageContent />
}

function UsageContent() {
  const { usage, loading } = useOpenClawUsage()

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }

  if (!usage) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No usage data available</span>
      </div>
    )
  }

  const models = usage.models

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '20px' }}>
      {/* Stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}>
        <StatCard label="Total Tokens" value={usage.total_tokens?.toLocaleString() ?? '--'} />
        <StatCard label="Total Cost" value={usage.total_cost != null ? '$' + usage.total_cost.toFixed(2) : '--'} />
        <StatCard label="Period" value={usage.period ?? 'All time'} />
      </div>

      {/* Model breakdown */}
      {Array.isArray(models) && models.length > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', marginTop: 0 }}>
            Model Usage
          </h3>
          <div style={{
            background: 'var(--bg-white-03)',
            border: '1px solid var(--hover-bg-bright)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}>
            {/* Header row */}
            <div style={{
              padding: '10px 16px',
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              gap: '8px',
              alignItems: 'center',
              borderBottom: '1px solid var(--hover-bg)',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Model</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Tokens</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Cost</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Requests</span>
            </div>
            {/* Data rows */}
            {models.map((m, i) => (
              <div key={m.model + i} style={{
                padding: '10px 16px',
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr',
                gap: '8px',
                alignItems: 'center',
                borderBottom: i < models.length - 1 ? '1px solid var(--hover-bg)' : 'none',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{m.model}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{m.tokens?.toLocaleString() ?? '--'}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{m.cost != null ? '$' + m.cost.toFixed(4) : '--'}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{m.requests?.toLocaleString() ?? '--'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-white-03)',
      border: '1px solid var(--hover-bg-bright)',
      borderRadius: '10px',
      padding: '16px 20px',
    }}>
      <div style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '6px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '24px',
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}>
        {value}
      </div>
    </div>
  )
}
