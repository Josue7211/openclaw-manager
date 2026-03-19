import { oauthBtnStyle } from './shared'

interface MainViewProps {
  loading: boolean
  onOAuth: (provider: 'github' | 'google') => void
  onShowEmail: () => void
}

export function MainView({ loading, onOAuth, onShowEmail }: MainViewProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      animation: 'fadeInUp 0.4s var(--ease-spring) 0.1s both',
    }}>
      <button
        onClick={() => onOAuth('github')}
        disabled={loading}
        style={oauthBtnStyle}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--hover-bg-bright)'
          e.currentTarget.style.borderColor = 'var(--border-hover)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--bg-white-04)'
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        Continue with GitHub
      </button>

      <button
        onClick={() => onOAuth('google')}
        disabled={loading}
        style={oauthBtnStyle}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--hover-bg-bright)'
          e.currentTarget.style.borderColor = 'var(--border-hover)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--bg-white-04)'
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {/* intentionally hardcoded — Google brand logo colors */}
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.42l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      {/* Divider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        margin: '4px 0',
      }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono', monospace",
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          or
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>

      <button
        onClick={onShowEmail}
        className="hover-bg-bright hover-border-accent"
        style={{
          ...oauthBtnStyle,
          color: 'var(--text-secondary)',
          fontSize: '12px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7l-10 7L2 7" />
        </svg>
        Sign in with email
      </button>
    </div>
  )
}
