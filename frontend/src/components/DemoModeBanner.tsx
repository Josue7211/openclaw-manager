import { AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function DemoModeBanner() {
  const navigate = useNavigate()

  return (
    <div role="status" style={{
      background: 'rgba(251, 191, 36, 0.1)',
      border: '1px solid rgba(251, 191, 36, 0.3)',
      borderRadius: '6px',
      padding: '8px 16px',
      fontSize: '13px',
      color: 'rgba(251, 191, 36, 0.9)',
      marginBottom: 16,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <AlertTriangle size={14} style={{ flexShrink: 0 }} />
      <span>
        Demo Mode — Connect your services in Settings to use real data
      </span>
      <button
        onClick={() => navigate('/settings?section=connections')}
        style={{
          marginLeft: 'auto',
          background: 'rgba(251, 191, 36, 0.2)',
          border: '1px solid rgba(251, 191, 36, 0.3)',
          borderRadius: '6px',
          padding: '4px 12px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'rgba(251, 191, 36, 0.95)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(251, 191, 36, 0.3)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(251, 191, 36, 0.2)'
        }}
      >
        Set up now
      </button>
    </div>
  )
}

/** Inline demo badge — shown next to section headers when data is demo */
export function DemoBadge() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: '100px',
      fontSize: '9px',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      background: 'rgba(251, 191, 36, 0.12)',
      color: 'var(--warning)',
      border: '1px solid rgba(251, 191, 36, 0.2)',
    }}>
      demo
    </span>
  )
}
