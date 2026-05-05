import { inputStyle, primaryBtnStyle, disabledBtnStyle } from './shared'

interface SyncUnlockViewProps {
  password: string
  loading: boolean
  onPasswordChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
  onSignOut: () => void
}

export function SyncUnlockView({
  password,
  loading,
  onPasswordChange,
  onSubmit,
  onSignOut,
}: SyncUnlockViewProps) {
  return (
    <form
      onSubmit={onSubmit}
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
      <input
        type="password"
        value={password}
        onChange={event => onPasswordChange(event.target.value)}
        placeholder="Account password"
        autoFocus
        autoComplete="current-password"
        aria-label="Account password"
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={loading || !password}
        style={loading || !password ? disabledBtnStyle : primaryBtnStyle}
      >
        {loading ? 'Unlocking sync...' : 'Unlock Synced Account'}
      </button>
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
    </form>
  )
}
