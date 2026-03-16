import { Send } from 'lucide-react'

export function NotConfiguredBanner() {
  return (
    <div style={{
      marginBottom: '12px', padding: '20px 24px', flexShrink: 0,
      background: 'var(--blue-a08)',
      border: '1px solid var(--blue-a25)',
      borderRadius: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <Send size={14} style={{ color: 'var(--blue-solid)' }} />
        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--blue-solid)' }}>OpenClaw not reachable</span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Chat requires an OpenClaw instance. Add the following to <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>.env.local</code> and restart:
      </p>
      <pre style={{ margin: '0', padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)', overflowX: 'auto', lineHeight: 1.8 }}>
{`OPENCLAW_WS=ws://your-openclaw-host:18789
OPENCLAW_PASSWORD=your-password
OPENCLAW_API_URL=http://your-openclaw-host:3001
OPENCLAW_API_KEY=your-api-key`}
      </pre>
    </div>
  )
}
