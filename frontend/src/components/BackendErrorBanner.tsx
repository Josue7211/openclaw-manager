import { Wifi } from 'lucide-react'

export function BackendErrorBanner() {
  return (
    <div style={{
      padding: '8px 16px', marginBottom: '16px', borderRadius: '10px',
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
      fontSize: '12px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <Wifi size={12} /> Backend unreachable — data may be stale
    </div>
  )
}
