'use client'

import { Settings } from 'lucide-react'

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '20px 24px',
  marginBottom: '16px',
}

const label: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '12px',
}

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: '13px',
  color: 'var(--text-primary)',
}

const rowLast: React.CSSProperties = { ...row, borderBottom: 'none' }

const val: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'monospace',
  fontSize: '12px',
}

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Settings size={20} style={{ color: 'var(--text-secondary)' }} />
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Settings</h1>
      </div>

      {/* Agent */}
      <div style={card}>
        <div style={label}>Agent</div>
        <div style={row}><span>Name</span><span style={val}>Bjorn</span></div>
        <div style={row}><span>Model</span><span style={val}>claude-sonnet-4-6</span></div>
        <div style={row}><span>Session key</span><span style={val}>agent:main:main</span></div>
        <div style={rowLast}><span>Emoji</span><span style={{ fontSize: '18px' }}>🦬</span></div>
      </div>

      {/* Gateway */}
      <div style={card}>
        <div style={label}>Gateway</div>
        <div style={row}><span>WebSocket</span><span style={val}>ws://127.0.0.1:18789</span></div>
        <div style={row}><span>HTTP</span><span style={val}>http://127.0.0.1:18789</span></div>
        <div style={rowLast}><span>Auth</span><span style={val}>password</span></div>
      </div>

      {/* Mission Control */}
      <div style={card}>
        <div style={label}>Mission Control</div>
        <div style={row}><span>Host</span><span style={val}>10.0.0.SERVICES:3000</span></div>
        <div style={row}><span>Poll interval</span><span style={val}>2s</span></div>
        <div style={rowLast}><span>Session file</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px' }}>~/.openclaw/agents/main/sessions/</span></div>
      </div>

      {/* User */}
      <div style={card}>
        <div style={label}>User</div>
        <div style={row}><span>Name</span><span style={val}>Josue</span></div>
        <div style={rowLast}><span>Avatar</span><span style={{ fontSize: '18px' }}>🦍</span></div>
      </div>
    </div>
  )
}
