import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function DemoModeBanner() {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  return (
    <div role="status" style={{
      background: 'rgba(251, 191, 36, 0.1)',
      border: '1px solid rgba(251, 191, 36, 0.3)',
      borderRadius: '10px',
      padding: expanded ? '12px 16px' : '8px 16px',
      fontSize: '13px',
      color: 'rgba(251, 191, 36, 0.9)',
      marginBottom: 16,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: expanded ? '10px' : '0px',
      transition: 'padding 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <AlertTriangle size={14} style={{ flexShrink: 0 }} />
        <span>
          Demo Mode — showing sample data, no backend required
        </span>
        <button
          onClick={() => setExpanded(p => !p)}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: 'rgba(251, 191, 36, 0.8)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={() => navigate('/settings?section=connections')}
          style={{
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
      {expanded && (
        <div style={{
          fontSize: '12px',
          color: 'rgba(251, 191, 36, 0.75)',
          lineHeight: 1.7,
          paddingLeft: '24px',
        }}>
          <p style={{ margin: '0 0 6px' }}>
            To exit demo mode, add <code style={{
              background: 'rgba(251, 191, 36, 0.12)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}>VITE_SUPABASE_URL</code> and <code style={{
              background: 'rgba(251, 191, 36, 0.12)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}>VITE_SUPABASE_ANON_KEY</code> to your <code style={{
              background: 'rgba(251, 191, 36, 0.12)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}>.env.local</code> file and restart the dev server.
          </p>
          <p style={{ margin: 0 }}>
            Each module (Messages, Chat, HomeLab) has its own connection settings in Settings &rarr; Connections.
          </p>
        </div>
      )}
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
