import { inputStyle, primaryBtnStyle, disabledBtnStyle } from './shared'

interface MfaVerifyFormProps {
  mfaCode: string
  loading: boolean
  onMfaCodeChange: (val: string) => void
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
}

export function MfaVerifyForm({ mfaCode, loading, onMfaCodeChange, onSubmit, onBack }: MfaVerifyFormProps) {
  return (
    <form onSubmit={onSubmit} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      animation: 'fadeInUp 0.3s var(--ease-spring) both',
    }}>
      <div style={{
        textAlign: 'center',
        padding: '8px 0',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '14px',
          background: 'var(--purple-a10)',
          border: '1px solid var(--purple-a20)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 8px',
          fontSize: '22px',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <p style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          margin: 0,
        }}>
          Open your authenticator app and enter the 6-digit code
        </p>
      </div>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={mfaCode}
        onChange={e => onMfaCodeChange(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        autoFocus
        autoComplete="one-time-code"
        aria-label="MFA verification code"
        style={{
          ...inputStyle,
          textAlign: 'center',
          fontSize: '20px',
          letterSpacing: '0.3em',
          padding: '14px',
        }}
      />
      <button
        type="submit"
        disabled={loading || mfaCode.length !== 6}
        style={loading || mfaCode.length !== 6 ? disabledBtnStyle : primaryBtnStyle}
        onMouseEnter={e => {
          if (!loading && mfaCode.length === 6) {
            e.currentTarget.style.background = 'var(--accent-bright)'
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 20px var(--accent-a30)'
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = (loading || mfaCode.length !== 6)
            ? 'var(--purple-a12)' : 'var(--accent)'
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        {loading ? 'Verifying...' : 'Verify'}
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
