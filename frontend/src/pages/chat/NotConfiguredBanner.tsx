import type { CSSProperties } from 'react'
import { GearSix, PaperPlaneTilt, PlugsConnected } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'

const codeStyle: CSSProperties = {
  background: 'var(--bg-elevated)',
  padding: '1px 5px',
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '12px',
}

const actionButtonStyle: CSSProperties = {
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  border: '1px solid var(--blue-a30)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  padding: '0 12px',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 650,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export function NotConfiguredBanner() {
  const navigate = useNavigate()

  return (
    <div role="status" style={{
      marginBottom: '12px',
      padding: '18px 20px',
      flexShrink: 0,
      background: 'var(--blue-a08)',
      border: '1px solid var(--blue-a25)',
      borderRadius: '12px',
      boxShadow: '0 12px 34px rgba(0, 0, 0, 0.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <PaperPlaneTilt size={14} style={{ color: 'var(--blue-solid)', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--blue-solid)' }}>Hermes Agent not configured</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/settings?section=connections')}
            style={actionButtonStyle}
          >
            <PlugsConnected size={14} />
            Connections
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings?section=hermes-agent')}
            style={actionButtonStyle}
          >
            <GearSix size={14} />
            Hermes Agent
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Chat needs Hermes Agent before it can send messages. Open <code style={codeStyle}>Settings &gt; Connections</code> to connect it, or use <code style={codeStyle}>Hermes Agent</code> settings for runtime details. You can also add these values to <code style={codeStyle}>.env.local</code> and restart:
      </p>
      <pre style={{ margin: '0', padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)', overflowX: 'auto', lineHeight: 1.8 }}>
{`HERMES_WS=ws://your-hermes-host:18789
HERMES_PASSWORD=your-password
HERMES_API_URL=http://your-hermes-host:3001
HERMES_API_KEY=your-api-key`}
      </pre>
    </div>
  )
}
