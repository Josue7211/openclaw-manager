import { inputStyle, primaryBtnStyle, disabledBtnStyle } from './shared'

interface SyncUnlockViewProps {
  password: string
  recoveryKey: string
  loading: boolean
  recoveryKeyConfigured: boolean
  syncedServiceCount: number
  hydratedServiceCount: number
  onPasswordChange: (value: string) => void
  onRecoveryKeyChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
  onRecoverySubmit: (event: React.FormEvent) => void
  onSignOut: () => void
}

export function SyncUnlockView({
  password,
  recoveryKey,
  loading,
  recoveryKeyConfigured,
  syncedServiceCount,
  hydratedServiceCount,
  onPasswordChange,
  onRecoveryKeyChange,
  onSubmit,
  onRecoverySubmit,
  onSignOut,
}: SyncUnlockViewProps) {
  const serviceLabel = syncedServiceCount === 1 ? 'service' : 'services'

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
        2FA is done. This Mac is signed in, but it does not have the local decrypt key for synced services yet.
      </div>
      <div style={{
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        color: 'var(--text-secondary)',
        fontSize: '12px',
        lineHeight: 1.5,
      }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
          {syncedServiceCount || 0} synced {serviceLabel} locked on this Mac
        </div>
        <div>
          {hydratedServiceCount > 0
            ? `${hydratedServiceCount} local service entries are already available here.`
            : 'Local services stay untouched while cloud sync waits for the key.'}
        </div>
      </div>
      {recoveryKeyConfigured ? (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--text-muted)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: 0,
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
              placeholder="Recovery key"
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
        </>
      ) : (
        <div style={{
          padding: '10px 12px',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          background: 'var(--bg-white-03)',
          color: 'var(--text-muted)',
          fontSize: '12px',
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          No recovery key exists for this account, so clawctrl will not ask for one.
        </div>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: 'var(--text-muted)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: 0,
      }}>
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        Sync password
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="password"
          value={password}
          onChange={event => onPasswordChange(event.target.value)}
          placeholder="Password that created sync"
          autoComplete="current-password"
          aria-label="Sync password"
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
