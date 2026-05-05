import { inputStyle, primaryBtnStyle, disabledBtnStyle } from './shared'

interface SyncUnlockViewProps {
  password: string
  recoveryKey: string
  loading: boolean
  handoffCode: string
  handoffLoading: boolean
  handoffStatus: string
  onPasswordChange: (value: string) => void
  onRecoveryKeyChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
  onRecoverySubmit: (event: React.FormEvent) => void
  onRequestHandoff: () => void
  onSignOut: () => void
}

export function SyncUnlockView({
  password,
  recoveryKey,
  loading,
  handoffCode,
  handoffLoading,
  handoffStatus,
  onPasswordChange,
  onRecoveryKeyChange,
  onSubmit,
  onRecoverySubmit,
  onRequestHandoff,
  onSignOut,
}: SyncUnlockViewProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        animation: 'fadeInUp 0.3s var(--ease-spring) both',
      }}
    >
      <div style={{
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid var(--border)',
        background: 'var(--bg-white-03)',
        color: 'var(--text-secondary)',
        fontSize: '12px',
        lineHeight: 1.5,
        textAlign: 'center',
      }}>
        Your account is synced. Unlock it once on this Mac so Connected Services can hydrate locally.
      </div>
      {handoffCode ? (
        <div style={{
          padding: '10px 12px',
          borderRadius: '10px',
          border: '1px solid var(--accent-a20)',
          background: 'var(--accent-a10)',
          color: 'var(--text-primary)',
          fontSize: '12px',
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '6px' }}>Approval code</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '22px', letterSpacing: '0.08em', fontWeight: 700 }}>
            {handoffCode}
          </div>
          <div style={{ color: 'var(--text-muted)', marginTop: '6px' }}>
            {handoffStatus || 'Waiting for an unlocked device to approve this Mac.'}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onRequestHandoff}
          disabled={handoffLoading}
          style={handoffLoading ? disabledBtnStyle : {
            ...primaryBtnStyle,
            background: 'var(--bg-white-04)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {handoffLoading ? 'Creating request...' : 'Request Trusted Device Approval'}
        </button>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: 'var(--text-muted)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        Recovery key
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>
      <form onSubmit={onRecoverySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="password"
          value={recoveryKey}
          onChange={event => onRecoveryKeyChange(event.target.value)}
          placeholder="ccrk_v1_..."
          autoComplete="off"
          aria-label="Recovery key"
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={loading || !recoveryKey}
          style={loading || !recoveryKey ? disabledBtnStyle : primaryBtnStyle}
        >
          {loading ? 'Unlocking sync...' : 'Unlock with Recovery Key'}
        </button>
      </form>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: 'var(--text-muted)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        Password fallback
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="password"
          value={password}
          onChange={event => onPasswordChange(event.target.value)}
          placeholder="Account password"
          autoComplete="current-password"
          aria-label="Account password"
          style={inputStyle}
        />
        <button type="submit" disabled={loading || !password} style={loading || !password ? disabledBtnStyle : primaryBtnStyle}>
          {loading ? 'Unlocking sync...' : 'Unlock with Password'}
        </button>
      </form>
      <button
        type="button"
        onClick={onSignOut}
        className="hover-text-secondary"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: '12px',
          cursor: 'pointer',
          padding: '4px',
          transition: 'all 0.15s',
        }}
      >
        Use a different account
      </button>
    </div>
  )
}
