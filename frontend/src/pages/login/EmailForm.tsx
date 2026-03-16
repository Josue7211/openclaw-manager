import { inputStyle, primaryBtnStyle, disabledBtnStyle } from './shared'

interface EmailFormProps {
  email: string
  password: string
  loading: boolean
  onEmailChange: (val: string) => void
  onPasswordChange: (val: string) => void
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
}

export function EmailForm({ email, password, loading, onEmailChange, onPasswordChange, onSubmit, onBack }: EmailFormProps) {
  return (
    <form onSubmit={onSubmit} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      animation: 'fadeInUp 0.3s var(--ease-spring) both',
    }}>
      <input
        type="email"
        value={email}
        onChange={e => onEmailChange(e.target.value)}
        placeholder="Email"
        autoFocus
        autoComplete="email"
        aria-label="Email"
        style={inputStyle}
      />
      <input
        type="password"
        value={password}
        onChange={e => onPasswordChange(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        aria-label="Password"
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={loading || !email || !password}
        style={loading || !email || !password ? disabledBtnStyle : primaryBtnStyle}
        onMouseEnter={e => {
          if (!loading && email && password) {
            e.currentTarget.style.background = 'var(--accent-bright)'
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(167, 139, 250, 0.3)'
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = (loading || !email || !password)
            ? 'var(--purple-a12)' : 'var(--accent)'
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
      <button
        type="button"
        onClick={onBack}
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
        Back to all sign-in options
      </button>
    </form>
  )
}
