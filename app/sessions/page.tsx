export default function SessionsPage() {
  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Sessions</h1>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          active + recent sessions
        </p>
      </div>
      <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>💬</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Coming Soon</div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Full session browser — view history, active sessions, and sub-agents here.
        </div>
        <div className="mono" style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '11px' }}>
          // page under construction
        </div>
      </div>
    </div>
  )
}
