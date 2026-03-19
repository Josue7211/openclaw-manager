import { useState } from 'react'
import { inputStyle, primaryBtnStyle, disabledBtnStyle } from './shared'
import { api } from '@/lib/api'

interface MfaEnrollViewProps {
  mfaFactorId: string
  mfaQr: string | null
  mfaSecret: string | null
  next: string
}

export function MfaEnrollView({ mfaFactorId, mfaQr, mfaSecret, next }: MfaEnrollViewProps) {
  const [mfaCode, setMfaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      animation: 'fadeInUp 0.3s var(--ease-spring) both',
    }}>
      <div style={{
        padding: '10px 14px',
        background: 'var(--warning-a08)',
        border: '1px solid var(--warning-a20)',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--warning)',
        textAlign: 'center',
      }}>
        Two-factor authentication is required to continue
      </div>

      <p style={{
        fontSize: '12px',
        color: 'var(--text-secondary)',
        margin: 0,
        textAlign: 'center',
      }}>
        Scan this QR code with your authenticator app
      </p>

      {mfaQr && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '16px',
          background: 'var(--text-on-color)',
          borderRadius: '12px',
          width: 'fit-content',
          margin: '0 auto',
        }}>
          <img src={mfaQr} alt="TOTP QR code" width={180} height={180} />
        </div>
      )}

      {mfaSecret && (
        <div style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
        }}>
          Manual key: <span style={{ color: 'var(--text-secondary)', userSelect: 'all' }}>{mfaSecret}</span>
        </div>
      )}

      {error && (
        <div style={{
          fontSize: '12px',
          color: 'var(--red)',
          textAlign: 'center',
          padding: '8px 12px',
          background: 'var(--red-a08)',
          border: '1px solid var(--red-a15)',
          borderRadius: '8px',
          animation: 'fadeInUp 0.3s ease both',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
          const challenge = await api.post<{ id: string }>('/api/auth/mfa/challenge', {
            factor_id: mfaFactorId,
          })

          await api.post('/api/auth/mfa/verify', {
            factor_id: mfaFactorId,
            challenge_id: challenge.id,
            code: mfaCode,
          })

          window.location.href = next
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Verification failed')
          setMfaCode('')
          setLoading(false)
        }
      }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={mfaCode}
          onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
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
          {loading ? 'Verifying...' : 'Verify & continue'}
        </button>
      </form>
    </div>
  )
}
