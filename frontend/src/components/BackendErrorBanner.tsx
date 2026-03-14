import { Wifi } from 'lucide-react'

interface Props {
  /** Service-specific label, e.g. "BlueBubbles unreachable". Falls back to generic message. */
  label?: string
}

export function BackendErrorBanner({ label }: Props = {}) {
  return (
    <div style={{
      padding: '8px 16px', marginBottom: '16px', borderRadius: '10px',
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
      fontSize: '12px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <Wifi size={12} /> {label || 'Backend unreachable'} — showing cached data
    </div>
  )
}
