import React from 'react'
import { Wifi } from 'lucide-react'

export const NetworkCard = React.memo(function NetworkCard() {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Wifi size={14} style={{ color: 'var(--accent-blue)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Network</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>OpenClaw Gateway</div>
          <div className="mono" style={{ color: 'var(--green-bright)', fontSize: '12px' }}>{`${window.location.protocol}//${window.location.hostname}:18789`}</div>
          <span className="badge badge-green" style={{ marginTop: '5px' }}>● Active</span>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>OpenClaw Manager</div>
          <div className="mono" style={{ color: 'var(--blue-bright)', fontSize: '12px' }}>{window.location.origin}</div>
          <span className="badge badge-blue" style={{ marginTop: '5px' }}>This app</span>
        </div>
      </div>
    </div>
  )
})
